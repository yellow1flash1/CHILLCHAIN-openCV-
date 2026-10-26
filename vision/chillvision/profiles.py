"""Per-crop colour knowledge for the OpenCV pipeline.

Hues are OpenCV HSV hues (0-179). Keys match `src/lib/crops.ts`, so the app and the vision
service agree on what each crop is. A profile answers three questions for a crop:

* which colours mean "ripe" and which mean "not yet ripe" (for the ripeness stage),
* which colours are expected at all (to catch a photo of the wrong thing),
* which natural looks must not be mistaken for defects (dark-skinned fruit, white bloom).
"""

from __future__ import annotations

from dataclasses import dataclass, field

HueRange = tuple[int, int]

RED: list[HueRange] = [(0, 10), (165, 179)]
GREEN: list[HueRange] = [(30, 88)]
YELLOW_ORANGE: list[HueRange] = [(8, 30)]
PURPLE: list[HueRange] = [(118, 172)]
PINK_MAGENTA: list[HueRange] = [(138, 179), (0, 6)]
BLUE_PURPLE: list[HueRange] = [(98, 150)]
LEAF: list[HueRange] = [(30, 90)]  # caps, stems, bracts


@dataclass(frozen=True)
class CropProfile:
    key: str
    ripe: list[HueRange] = field(default_factory=list)
    unripe: list[HueRange] = field(default_factory=list)
    # Other colours that belong to a normal photo of this crop (caps, stems, bracts).
    extra: list[HueRange] = field(default_factory=list)
    # Ripe skin is naturally dark (avocado, jamun, blueberry...): dark-spot detection is relative only.
    dark_ok: bool = False
    # Pale or white is normal (mushrooms, blueberry bloom, white flowers): no "mould = pale fuzz" rule.
    white_ok: bool = False
    # Share of ripe colour needed for grade A (strawberry, litchi and cherry must be fully coloured).
    full_colour_for_a: float | None = None
    # Ripe colour is dark rather than a hue (Hass avocado).
    ripe_is_dark: bool = False
    # Small fruit sold as a crate or punnet: one piece in the photo is weak evidence for the lot.
    small: bool = False

    @property
    def has_colour_model(self) -> bool:
        return bool(self.ripe or self.ripe_is_dark)

    @property
    def expected(self) -> list[HueRange]:
        return [*self.ripe, *self.unripe, *self.extra]


_P = CropProfile
PROFILES: dict[str, CropProfile] = {
    p.key: p
    for p in [
        _P("strawberry", RED, [(15, 88)], LEAF, full_colour_for_a=0.9, small=True),
        _P("cherry_tomato", RED, GREEN, LEAF + YELLOW_ORANGE, small=True),
        _P("apple", RED, GREEN, YELLOW_ORANGE),
        _P("litchi", RED + [(160, 179)], GREEN, YELLOW_ORANGE, full_colour_for_a=0.8, small=True),
        _P("rambutan", RED, GREEN, YELLOW_ORANGE + LEAF, small=True),
        _P("dragon", PINK_MAGENTA, GREEN, LEAF + RED),
        _P("pomegranate", RED, GREEN, YELLOW_ORANGE),
        _P("cherry", RED + [(155, 179)], [(10, 40)], LEAF, dark_ok=True, full_colour_for_a=0.85, small=True),
        _P("mango", YELLOW_ORANGE, GREEN, RED),
        _P("avocado", [], GREEN, YELLOW_ORANGE, dark_ok=True, ripe_is_dark=True),
        _P("blueberry", BLUE_PURPLE, RED + GREEN, PURPLE, dark_ok=True, white_ok=True, small=True),
        _P("jamun", PURPLE, GREEN + RED, BLUE_PURPLE, dark_ok=True, small=True),
        _P("passion", PURPLE, GREEN, YELLOW_ORANGE + RED, dark_ok=True),
        _P("mangosteen", PURPLE, GREEN + RED, LEAF, dark_ok=True),
        _P("capsicum_colour", RED + YELLOW_ORANGE, GREEN, LEAF),
        # No reliable colour-ripeness rule (green and black varieties, brown skin, flowers, greens):
        # these are graded on defects, browning and uniformity only.
        _P("grapes", dark_ok=True, small=True),
        _P("fig", dark_ok=True),
        _P("kiwi", dark_ok=True),
        _P("mushroom_button", white_ok=True, small=True),
        _P("mushroom_oyster", white_ok=True),
        _P("mushroom_shiitake", dark_ok=True),
        _P("rose"),
        _P("gerbera"),
        _P("orchid", white_ok=True),
        _P("marigold"),
        _P("tuberose", white_ok=True),
        _P("carnation", white_ok=True),
        _P("microgreens", small=True),
        _P("lettuce"),
    ]
}


def profile_for(crop: str) -> CropProfile:
    """Known crops get their profile; anything else is graded on defects only."""
    return PROFILES.get(crop, CropProfile(crop))
