use base64::Engine;
use flate2::bufread::GzDecoder;
use minisign_verify::{PublicKey, Signature};
use sha2::{Digest, Sha256};
use std::io::{Cursor, Read};
use std::path::Path;
use tauri::Url;

const MAX_BYTES: usize = 256 * 1024 * 1024;
const MAX_INSTALLER_BYTES: usize = 64 * 1024 * 1024;
const MAX_CHECKSUM_BYTES: usize = 64 * 1024;
const MAX_SIGNATURE_BYTES: usize = 8 * 1024;

pub fn read_base(path: &Path) -> Option<Vec<u8>> {
    let file = std::fs::File::open(path).ok()?;
    if file.metadata().ok()?.len() > MAX_BYTES as u64 {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= MAX_BYTES).then_some(bytes)
}

fn word(input: &mut impl Read) -> Option<i32> {
    let mut bytes = [0; 4];
    input.read_exact(&mut bytes).ok()?;
    Some(i32::from_be_bytes(bytes))
}

fn apply(base: &[u8], base_digest: &[u8; 32], patch: &[u8]) -> Option<Vec<u8>> {
    if patch.get(..8)? != b"ZyxDLT01" || patch.get(8..40)? != base_digest {
        return None;
    }
    let expected_digest = patch.get(40..72)?;
    let mut input = Cursor::new(patch.get(72..)?);
    let size = usize::try_from(word(&mut input)?).ok()?;
    if size == 0 || size > MAX_BYTES || patch.len() >= size {
        return None;
    }

    let mut output = Vec::with_capacity(size);
    while output.len() < size {
        let record = word(&mut input)?;
        let length = record.unsigned_abs() as usize;
        if length == 0 || length > size - output.len() {
            return None;
        }
        if record < 0 {
            let offset = usize::try_from(word(&mut input)?).ok()?;
            output.extend_from_slice(base.get(offset..offset.checked_add(length)?)?);
        } else {
            let start = input.position() as usize;
            let end = start.checked_add(length)?;
            output.extend_from_slice(input.get_ref().get(start..end)?);
            input.set_position(end as u64);
        }
    }
    (input.position() as usize == input.get_ref().len()
        && Sha256::digest(&output).as_slice() == expected_digest)
        .then_some(output)
}

fn apply_installer(base: &[u8], base_digest: &[u8; 32], patch: &[u8]) -> Option<Vec<u8>> {
    let mut input = GzDecoder::new(Cursor::new(patch));
    let mut magic = [0; 8];
    let mut expected_base = [0; 32];
    let mut expected_target = [0; 32];
    input.read_exact(&mut magic).ok()?;
    input.read_exact(&mut expected_base).ok()?;
    input.read_exact(&mut expected_target).ok()?;
    if &magic != b"ZyxINS01" || &expected_base != base_digest {
        return None;
    }
    let size = usize::try_from(word(&mut input)?).ok()?;
    if size == 0 || size > MAX_INSTALLER_BYTES || patch.len() >= size {
        return None;
    }

    let mut output = Vec::with_capacity(size);
    let mut source = 0i64;
    let mut records = 0;
    while output.len() < size {
        let differences = usize::try_from(word(&mut input)?).ok()?;
        let literals = usize::try_from(word(&mut input)?).ok()?;
        let next = i64::from(word(&mut input)?);
        let count = differences.checked_add(literals)?;
        records += 1;
        if count > size - output.len() || records > 1_000_000 {
            return None;
        }

        let offset = output.len();
        output.resize(offset + count, 0);
        input.read_exact(&mut output[offset..]).ok()?;

        // BSDIFF treats addresses outside the old file as zero.
        let first = source.max(0);
        let end = (source + differences as i64).min(base.len() as i64);
        if first < end {
            let start = offset + (first - source) as usize;
            let old = &base[first as usize..end as usize];
            for (byte, previous) in output[start..start + old.len()].iter_mut().zip(old) {
                *byte = byte.wrapping_add(*previous);
            }
        }
        source = source.checked_add(differences as i64 + next)?;
    }

    (input.read(&mut [0; 1]).ok()? == 0
        && input.into_inner().position() == patch.len() as u64
        && Sha256::digest(&output).as_slice() == expected_target)
        .then_some(output)
}

fn sibling(url: &Url, name: &str) -> Option<Url> {
    let mut result = url.clone();
    result.path_segments_mut().ok()?.pop().push(name);
    Some(result)
}

async fn fetch_with_progress<F>(
    client: &reqwest::Client,
    url: Url,
    limit: usize,
    mut on_progress: F,
) -> Option<Vec<u8>>
where
    F: FnMut(usize, Option<u64>),
{
    let mut response = client
        .get(url)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let total = response.content_length();
    if total.is_some_and(|size| size > limit as u64) {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if chunk.len() > limit - bytes.len() {
            return None;
        }
        on_progress(chunk.len(), total);
        bytes.extend_from_slice(&chunk);
    }
    Some(bytes)
}

async fn fetch(client: &reqwest::Client, url: Url, limit: usize) -> Option<Vec<u8>> {
    fetch_with_progress(client, url, limit, |_, _| {}).await
}

fn parse_tauri_pubkey(raw_pubkey: &str) -> Option<PublicKey> {
    let trimmed = raw_pubkey.trim();
    if let Ok(decoded_bytes) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
        if let Ok(text) = std::str::from_utf8(&decoded_bytes) {
            if let Some(key_line) = text
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty() && !line.starts_with("untrusted comment:"))
            {
                if let Ok(pk) = PublicKey::from_base64(key_line) {
                    return Some(pk);
                }
            }
        }
    }
    PublicKey::from_base64(trimmed).ok()
}

fn parse_tauri_signature(raw_sig: &str) -> Option<Signature> {
    let trimmed = raw_sig.trim();
    if let Ok(decoded_bytes) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
        if let Ok(text) = std::str::from_utf8(&decoded_bytes) {
            if let Ok(sig) = Signature::decode(text) {
                return Some(sig);
            }
        }
    }
    Signature::decode(trimmed).ok()
}

pub fn verify_minisign(raw_pubkey: &str, raw_sig: &str, bytes: &[u8]) -> bool {
    let Some(pubkey) = parse_tauri_pubkey(raw_pubkey) else {
        return false;
    };
    let Some(sig) = parse_tauri_signature(raw_sig) else {
        return false;
    };
    pubkey.verify(bytes, &sig, false).is_ok()
}

pub async fn download<F>(
    client: &reqwest::Client,
    url: &Url,
    asset: &str,
    base: &[u8],
    on_progress: F,
) -> Option<Vec<u8>>
where
    F: FnMut(usize, Option<u64>),
{
    let base_digest = Sha256::digest(base);
    let name = format!("{asset}.from-{base_digest:x}.zyxdelta");
    let patch = fetch_with_progress(client, sibling(url, &name)?, MAX_BYTES, on_progress).await?;
    apply(base, &base_digest.into(), &patch)
}

pub async fn download_installer<F>(
    client: &reqwest::Client,
    url: &Url,
    asset: &str,
    executable: &Path,
    required_pubkey: Option<&str>,
    on_progress: F,
) -> Option<Vec<u8>>
where
    F: FnMut(usize, Option<u64>),
{
    let base = read_base(executable)?;
    if base.len() > MAX_INSTALLER_BYTES {
        return None;
    }
    let base_digest = Sha256::digest(&base);
    let name = format!("{asset}.from-exe-{base_digest:x}.zyxdesktop.gz");
    let patch =
        fetch_with_progress(client, sibling(url, &name)?, MAX_INSTALLER_BYTES, on_progress).await?;
    if let Some(pubkey) = required_pubkey {
        let sig_name = format!("{name}.sig");
        let sig_raw = fetch(client, sibling(url, &sig_name)?, MAX_SIGNATURE_BYTES).await?;
        let sig_text = std::str::from_utf8(&sig_raw).ok()?;
        if !verify_minisign(pubkey, sig_text, &patch) {
            return None;
        }
    } else {
        matches_release_checksum(client, url, &name, &patch).await?;
    }
    apply_installer(&base, &base_digest.into(), &patch)
}

pub async fn matches_release_checksum(
    client: &reqwest::Client,
    url: &Url,
    asset: &str,
    bytes: &[u8],
) -> Option<()> {
    let raw = fetch(client, sibling(url, "SHA256SUMS.txt")?, MAX_CHECKSUM_BYTES).await?;
    let checksums = std::str::from_utf8(&raw).ok()?;
    let expected = checksums.lines().find_map(|line| {
        let (hash, name) = line.split_once("  ")?;
        (name == asset).then_some(hash)
    })?;
    (format!("{:x}", Sha256::digest(bytes)) == expected).then_some(())
}

pub fn cache(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    std::fs::create_dir_all(dir)?;
    let mut temp = tempfile::NamedTempFile::new_in(dir)?;
    std::io::Write::write_all(temp.as_file_mut(), bytes)?;
    temp.persist(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconstructs_and_checks_bounds_and_target_digest() {
        let base = vec![b'x'; 4096];
        let mut target = base.clone();
        target.extend_from_slice(b"abc");
        let base_digest: [u8; 32] = Sha256::digest(&base).into();
        let mut patch = b"ZyxDLT01".to_vec();
        patch.extend_from_slice(&base_digest);
        patch.extend_from_slice(&Sha256::digest(&target));
        for word in [4099i32, -4096, 0, 3] {
            patch.extend_from_slice(&word.to_be_bytes());
        }
        patch.extend_from_slice(b"abc");

        assert_eq!(apply(&base, &base_digest, &patch), Some(target));
        assert!(apply(&base, &[0; 32], &patch).is_none());
        assert!(apply(&base, &base_digest, &patch[..patch.len() - 1]).is_none());
        patch[83] = 1;
        assert!(apply(&base, &base_digest, &patch).is_none());
        patch[83] = 0;
        patch[87] = 0;
        assert!(apply(&base, &base_digest, &patch).is_none());
    }
    #[test]
    fn installer_differences_reconstruct_and_reject_truncated_gzip() {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;

        let base = vec![b'x'; 4096];
        let target = vec![b'y'; base.len()];
        let base_digest: [u8; 32] = Sha256::digest(&base).into();
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(b"ZyxINS01").unwrap();
        encoder.write_all(&base_digest).unwrap();
        encoder.write_all(&Sha256::digest(&target)).unwrap();
        for value in [4096i32, 4096, 0, 0] {
            encoder.write_all(&value.to_be_bytes()).unwrap();
        }
        encoder.write_all(&vec![1; base.len()]).unwrap();
        let patch = encoder.finish().unwrap();

        assert_eq!(apply_installer(&base, &base_digest, &patch), Some(target));
        assert!(apply_installer(&base, &base_digest, &patch[..patch.len() - 1]).is_none());
    }
}
