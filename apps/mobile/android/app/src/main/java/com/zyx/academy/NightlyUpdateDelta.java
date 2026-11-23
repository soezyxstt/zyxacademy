package com.zyx.academy;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.zip.DataFormatException;
import java.util.zip.Deflater;
import java.util.zip.DeflaterOutputStream;
import java.util.zip.GZIPInputStream;
import java.util.zip.Inflater;

final class NightlyUpdateDelta {
    static final long MAX_BYTES = 256L * 1024 * 1024;
    private static final byte[] MAGIC = { 'Z', 'y', 'x', 'D', 'L', 'T', '0', '1' };
    private static final byte[] APK_MAGIC = { 'Z', 'y', 'x', 'A', 'P', 'K', '0', '1' };
    private static final int MAX_EXPANDED_APK_BYTES = 64 * 1024 * 1024;
    private static final int MAX_DEX_BYTES = 32 * 1024 * 1024;
    private static final String HEX = "0123456789abcdef";

    private NightlyUpdateDelta() {}

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static byte[] digest(File file) throws IOException {
        if (file.length() <= 0 || file.length() > MAX_BYTES) {
            throw new IOException("Unsupported update package size");
        }
        MessageDigest digest = sha256();
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
        }
        return digest.digest();
    }

    static String releaseChecksum(java.io.BufferedReader reader, String asset) throws IOException {
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.length() > 66 && line.substring(66).equals(asset)
                && line.substring(0, 66).matches("[a-f0-9]{64}  ")) {
                return line.substring(0, 64);
            }
        }
        return null;
    }

    static void verifyChecksum(File file, String expected) throws IOException {
        if (!hex(digest(file)).equals(expected)) throw new IOException("APK release checksum differs");
    }

    static String hex(byte[] bytes) {
        StringBuilder hex = new StringBuilder(bytes.length * 2);
        for (byte current : bytes) {
            hex.append(HEX.charAt((current & 0xff) >>> 4)).append(HEX.charAt(current & 0xf));
        }
        return hex.toString();
    }

    static void apply(File base, byte[] baseDigest, File patch, File target) throws IOException {
        try (
            DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(patch)));
            RandomAccessFile previous = new RandomAccessFile(base, "r");
            FileOutputStream output = new FileOutputStream(target)
        ) {
            byte[] magic = new byte[MAGIC.length];
            byte[] expectedBase = new byte[32];
            byte[] expectedTarget = new byte[32];
            input.readFully(magic);
            input.readFully(expectedBase);
            input.readFully(expectedTarget);
            int remaining = input.readInt();
            if (!Arrays.equals(magic, MAGIC) || !MessageDigest.isEqual(baseDigest, expectedBase)
                || remaining <= patch.length() || remaining > MAX_BYTES) {
                throw new IOException("Invalid update patch header");
            }
            MessageDigest digest = sha256();
            byte[] buffer = new byte[16384];
            while (remaining > 0) {
                int record = input.readInt();
                long length = Math.abs((long) record);
                if (length == 0 || length > remaining) {
                    throw new IOException("Invalid update patch length");
                }
                if (record < 0) {
                    int offset = input.readInt();
                    if (offset < 0 || offset + length > previous.length()) {
                        throw new IOException("Invalid update patch offset");
                    }
                    previous.seek(offset);
                }
                remaining -= (int) length;
                while (length > 0) {
                    int count = (int) Math.min(buffer.length, length);
                    if (record < 0) {
                        previous.readFully(buffer, 0, count);
                    } else {
                        input.readFully(buffer, 0, count);
                    }
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    length -= count;
                }
            }
            if (input.read() != -1 || !MessageDigest.isEqual(digest.digest(), expectedTarget)) {
                throw new IOException("Update patch verification failed");
            }
        }
    }

    static void applyApk(File base, byte[] baseDigest, File patch, File target) throws IOException {
        try (
            InputStream file = new FileInputStream(patch);
            DataInputStream input = new DataInputStream(new BufferedInputStream(new GZIPInputStream(file)))
        ) {
            byte[] magic = new byte[APK_MAGIC.length];
            byte[] expectedBase = new byte[32];
            byte[] expectedTarget = new byte[32];
            input.readFully(magic);
            input.readFully(expectedBase);
            input.readFully(expectedTarget);
            int expectedSize = input.readInt();
            if (!Arrays.equals(magic, APK_MAGIC) || !MessageDigest.isEqual(baseDigest, expectedBase)
                || expectedSize <= patch.length() || expectedSize > MAX_BYTES) {
                throw new IOException("Invalid optimized APK patch header");
            }
            Span[] oldSpans = readSpans(input);
            Span[] newSpans = readSpans(input);
            File expandedBase = File.createTempFile("expanded-base-", ".tmp", target.getParentFile());
            try {
                File expandedTarget = File.createTempFile("expanded-target-", ".tmp", target.getParentFile());
                try {
                    rewriteDex(base, expandedBase, oldSpans, true);
                    applyByteDifferences(expandedBase, input, expandedTarget);
                    rewriteDex(expandedTarget, target, newSpans, false);
                    if (target.length() != expectedSize || !MessageDigest.isEqual(digest(target), expectedTarget)) {
                        throw new IOException("Recompressed APK differs from release package");
                    }
                } finally {
                    expandedTarget.delete();
                }
            } finally {
                expandedBase.delete();
            }
        }
    }

    private static void applyByteDifferences(File base, DataInputStream patch, File target) throws IOException {
        int remaining = patch.readInt();
        if (remaining <= 0 || remaining > MAX_EXPANDED_APK_BYTES) {
            throw new IOException("Invalid expanded APK size");
        }
        try (
            RandomAccessFile previous = new RandomAccessFile(base, "r");
            OutputStream output = new BufferedOutputStream(new FileOutputStream(target))
        ) {
            long sourceOffset = 0;
            long sourceSize = previous.length();
            int records = 0;
            byte[] buffer = new byte[16384];
            byte[] baseBytes = new byte[buffer.length];
            while (remaining > 0) {
                int differences = patch.readInt();
                int literals = patch.readInt();
                int seek = patch.readInt();
                if (differences < 0 || literals < 0 || (long) differences + literals > remaining
                    || ++records > 1_000_000) {
                    throw new IOException("Invalid APK difference record");
                }
                remaining -= differences + literals;
                while (differences > 0) {
                    int count = Math.min(buffer.length, differences);
                    patch.readFully(buffer, 0, count);
                    long start = Math.max(0, sourceOffset);
                    long end = Math.min(sourceSize, sourceOffset + count);
                    if (start < end) {
                        int matchSize = (int) (end - start);
                        int bufferOffset = (int) (start - sourceOffset);
                        previous.seek(start);
                        previous.readFully(baseBytes, 0, matchSize);
                        for (int i = 0; i < matchSize; i++) {
                            buffer[bufferOffset + i] += baseBytes[i];
                        }
                    }
                    output.write(buffer, 0, count);
                    sourceOffset += count;
                    differences -= count;
                }
                while (literals > 0) {
                    int count = Math.min(buffer.length, literals);
                    patch.readFully(buffer, 0, count);
                    output.write(buffer, 0, count);
                    literals -= count;
                }
                sourceOffset += seek;
            }
            if (patch.read() != -1) throw new IOException("Trailing optimized APK patch data");
        }
    }

    private static final class Span {
        final int offset;
        final int sourceSize;
        final int targetSize;

        Span(int offset, int sourceSize, int targetSize) {
            this.offset = offset;
            this.sourceSize = sourceSize;
            this.targetSize = targetSize;
        }
    }

    private static Span[] readSpans(DataInputStream input) throws IOException {
        int count = input.readInt();
        if (count <= 0 || count > 32) throw new IOException("Invalid DEX span count");
        Span[] spans = new Span[count];
        long previousEnd = 0;
        for (int i = 0; i < count; i++) {
            int offset = input.readInt();
            int sourceSize = input.readInt();
            int targetSize = input.readInt();
            if (offset < previousEnd || sourceSize <= 0 || sourceSize > MAX_DEX_BYTES
                || targetSize <= 0 || targetSize > MAX_DEX_BYTES) {
                throw new IOException("Invalid DEX span");
            }
            spans[i] = new Span(offset, sourceSize, targetSize);
            previousEnd = (long) offset + sourceSize;
        }
        return spans;
    }

    private static void rewriteDex(File source, File target, Span[] spans, boolean expand) throws IOException {
        try (
            RandomAccessFile input = new RandomAccessFile(source, "r");
            OutputStream output = new BufferedOutputStream(new FileOutputStream(target))
        ) {
            long size = input.length();
            long outputSize = size;
            for (Span span : spans) {
                outputSize += (long) span.targetSize - span.sourceSize;
                if ((long) span.offset + span.sourceSize > size || outputSize > MAX_EXPANDED_APK_BYTES) {
                    throw new IOException("DEX span exceeds package bounds");
                }
            }
            byte[] buffer = new byte[16384];
            for (Span span : spans) {
                copy(input, output, span.offset - input.getFilePointer(), buffer);
                if (expand) inflate(input, output, span, buffer);
                else deflate(input, output, span, buffer);
            }
            copy(input, output, size - input.getFilePointer(), buffer);
        }
    }

    private static void copy(RandomAccessFile input, OutputStream output, long bytes, byte[] buffer)
        throws IOException {
        while (bytes > 0) {
            int count = (int) Math.min(bytes, buffer.length);
            input.readFully(buffer, 0, count);
            output.write(buffer, 0, count);
            bytes -= count;
        }
    }

    private static void inflate(RandomAccessFile input, OutputStream output, Span span, byte[] buffer)
        throws IOException {
        byte[] compressed = new byte[span.sourceSize];
        input.readFully(compressed);
        Inflater inflater = new Inflater(true);
        try {
            inflater.setInput(compressed);
            int remaining = span.targetSize;
            while (!inflater.finished()) {
                int count = inflater.inflate(buffer);
                if (count > remaining || (count == 0 && !inflater.finished())) {
                    throw new IOException("Invalid inflated DEX size");
                }
                output.write(buffer, 0, count);
                remaining -= count;
            }
            if (remaining != 0 || inflater.getRemaining() != 0) throw new IOException("Invalid DEX stream");
        } catch (DataFormatException ex) {
            throw new IOException("Invalid compressed DEX", ex);
        } finally {
            inflater.end();
        }
    }

    private static void deflate(RandomAccessFile input, OutputStream output, Span span, byte[] buffer)
        throws IOException {
        Deflater deflater = new Deflater(6, true);
        ByteArrayOutputStream compressed = new ByteArrayOutputStream(span.targetSize);
        try (DeflaterOutputStream stream = new DeflaterOutputStream(compressed, deflater)) {
            copy(input, stream, span.sourceSize, buffer);
            stream.finish();
            if (compressed.size() != span.targetSize) throw new IOException("Recompressed DEX size differs");
            compressed.writeTo(output);
        } finally {
            deflater.end();
        }
    }
}
