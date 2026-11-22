"""Convert BSDIFF40 into sequential records for the gzip patch readers."""

import bz2
import gzip
import struct
import sys
from pathlib import Path


def number(raw: bytes) -> int:
    value = int.from_bytes(raw, "little")
    return -(value & (2**63 - 1)) if value >> 63 else value


def encode(patch: bytes, output) -> None:
    if patch[:8] != b"BSDIFF40":
        raise ValueError("Invalid bsdiff header")

    control_size, diff_size, target_size = (
        number(patch[i:i + 8]) for i in (8, 16, 24)
    )
    diff_start = 32 + control_size
    extra_start = diff_start + diff_size
    if control_size < 0 or diff_size < 0 or extra_start > len(patch) or target_size <= 0:
        raise ValueError("Invalid bsdiff section size")

    control = bz2.decompress(patch[32:diff_start])
    differences = bz2.decompress(patch[diff_start:extra_start])
    literals = bz2.decompress(patch[extra_start:])
    if len(control) % 24 or len(differences) + len(literals) != target_size:
        raise ValueError("Invalid bsdiff output size")

    output.write(struct.pack(">i", target_size))
    diff_offset = literal_offset = 0
    for offset in range(0, len(control), 24):
        diff_count, literal_count, seek = (
            number(control[i:i + 8]) for i in range(offset, offset + 24, 8)
        )
        if (
            diff_count < 0 or literal_count < 0
            or diff_offset + diff_count > len(differences)
            or literal_offset + literal_count > len(literals)
        ):
            raise ValueError("Invalid bsdiff record")
        output.write(struct.pack(">iii", diff_count, literal_count, seek))
        output.write(differences[diff_offset:diff_offset + diff_count])
        output.write(literals[literal_offset:literal_offset + literal_count])
        diff_offset += diff_count
        literal_offset += literal_count
    if diff_offset != len(differences) or literal_offset != len(literals):
        raise ValueError("Trailing bsdiff data")


if __name__ == "__main__":
    patch = Path(sys.argv[1]).read_bytes()
    if len(sys.argv) == 3:
        with gzip.GzipFile(mode="wb", fileobj=sys.stdout.buffer, mtime=0, compresslevel=9) as output:
            output.write(bytes.fromhex(sys.argv[2]))
            encode(patch, output)
    else:
        encode(patch, sys.stdout.buffer)
