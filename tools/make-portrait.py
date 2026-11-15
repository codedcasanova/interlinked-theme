"""Give the console's companion a face of your own.

Redraws a picture as small colored cells and writes them into
hooks/portrait.ts, where the console picks them up in place of the drawn
figure. The desktop app does not draw a picture embedded in an SVG, so the
portrait is made of plain shapes: 56 x 76 cells, each 1.5px.

    python tools/make-portrait.py path/to/picture.png
    python tools/make-portrait.py path/to/picture.png --crop 203,0,436,342
    python tools/make-portrait.py --clear

Needs Pillow:  pip install pillow

Use only a picture you have the right to use, and leave hooks/portrait.ts
out of anything you publish unless the picture is yours to share.
"""

import argparse
import pathlib
import sys

COLS, ROWS, CELL = 56, 76, 1.5  # 84 x 114 px: the avatar's frame
X0, Y0 = 4, 8
COLORS = 56

TARGET = pathlib.Path(__file__).resolve().parent.parent / "hooks" / "portrait.ts"

HEADER = (
    "// The companion's portrait, as SVG markup: a picture redrawn as small colored\n"
    "// cells by tools/make-portrait.py. Export an empty string to go back to the\n"
    "// console's own drawn figure.\n"
    "//\n"
    "// Leave this file out of anything you publish unless the picture is yours to share.\n"
)


def number(value):
    return ("%.1f" % value).rstrip("0").rstrip(".")


def build(path, crop):
    try:
        from PIL import Image
    except ImportError:
        sys.exit("This tool needs Pillow. Install it with: pip install pillow")

    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(crop)
    else:
        # the tallest centered crop with the frame's proportions
        width, height = image.size
        want = COLS / ROWS
        if width / height > want:
            new_width = round(height * want)
            left = (width - new_width) // 2
            image = image.crop((left, 0, left + new_width, height))
        else:
            new_height = round(width / want)
            top = (height - new_height) // 2
            image = image.crop((0, top, width, top + new_height))

    small = image.resize((COLS, ROWS), Image.LANCZOS)
    indexed = small.quantize(colors=COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
    palette = indexed.getpalette()
    pixels = indexed.load()

    # one path per color, each a run of cells along a row
    paths = {}
    for y in range(ROWS):
        x = 0
        while x < COLS:
            color = pixels[x, y]
            run = 1
            while x + run < COLS and pixels[x + run, y] == color:
                run += 1
            # each run overlaps the row below by a hair so no seams show
            paths.setdefault(color, []).append(
                "M%s %sh%sv1.7h-%sz" % (number(X0 + x * CELL), number(Y0 + y * CELL), number(run * CELL), number(run * CELL))
            )
            x += run

    return "".join(
        '<path d="%s" fill="#%02x%02x%02x"/>'
        % ("".join(d), palette[c * 3], palette[c * 3 + 1], palette[c * 3 + 2])
        for c, d in paths.items()
    )


def main():
    parser = argparse.ArgumentParser(description="Make the companion's portrait from a picture.")
    parser.add_argument("picture", nargs="?", help="a PNG or JPEG")
    parser.add_argument("--crop", help="left,top,right,bottom in the picture's pixels")
    parser.add_argument("--clear", action="store_true", help="go back to the drawn figure")
    args = parser.parse_args()

    if args.clear:
        markup = ""
    elif args.picture:
        crop = tuple(int(n) for n in args.crop.split(",")) if args.crop else None
        if crop and len(crop) != 4:
            sys.exit("--crop takes four numbers: left,top,right,bottom")
        markup = build(args.picture, crop)
    else:
        parser.error("give a picture, or --clear")

    TARGET.write_text(HEADER + "export const PORTRAIT: string = '" + markup + "'\n", encoding="utf-8")
    print("Wrote %s (%d characters). Reload the mod to see it." % (TARGET, len(markup)))


if __name__ == "__main__":
    main()
