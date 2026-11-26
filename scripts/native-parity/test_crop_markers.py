import unittest

from PIL import Image

from compare import MARKER, crop_positions


class ComponentIdentityTests(unittest.TestCase):
    def test_gpu_rounding_keeps_the_marker_width_unique(self):
        frame = Image.new("RGB", (380, 8), "white")
        frame.paste(MARKER, (180, 1, 201, 2))
        frame.putpixel((180, 1), (224, 1, 239))
        frame.paste(MARKER, (30, 4, 350, 5))
        self.assertEqual(crop_positions(frame, 1, 21), [(30, 5)])
        for width in (19, 20, 22):
            self.assertEqual(crop_positions(frame, 1, width), [])

    def test_specimen_boundary_requires_the_original_full_width_strip(self):
        frame = Image.new("RGB", (380, 8), "white")
        frame.paste(MARKER, (180, 1, 201, 2))
        frame.paste(MARKER, (30, 4, 350, 5))
        frame.putpixel((30, 4), (224, 1, 239))
        self.assertEqual(crop_positions(frame, 1, 21), [])
