#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read the installer configuration the way Calamares does.

Calamares does not use YAML's own typing. It takes the text of every scalar
and decides with a few regular expressions (src/libcalamares/utils/Yaml.cpp,
Calamares 3.3): true/True/TRUE/on/On/ON is true, false/.../OFF is false,
digits are an integer, digits with one dot are a floating-point number,
everything else is a string, even when quoted. So "1.0" in quotes becomes the
number 1 (and is shown as "1"), and yes/no stay strings (which count as
true).

This check fails for every value whose meaning differs between Calamares and
standard YAML, so the files mean what they appear to mean.
"""
import glob
import re
import sys
from pathlib import Path

import yaml

TRUE = re.compile(r"^(true|True|TRUE|on|On|ON)$")
FALSE = re.compile(r"^(false|False|FALSE|off|Off|OFF)$")
INTEGER = re.compile(r"^[-+]?\d+$")
FLOAT = re.compile(r"^[-+]?\d*\.?\d+$")

YAML_TYPES = {
    "tag:yaml.org,2002:str": "string",
    "tag:yaml.org,2002:bool": "boolean",
    "tag:yaml.org,2002:int": "integer",
    "tag:yaml.org,2002:float": "number",
    "tag:yaml.org,2002:null": "nothing",
}


def calamares_type(text: str) -> str:
    if TRUE.match(text) or FALSE.match(text):
        return "boolean"
    if INTEGER.match(text):
        return "integer"
    if FLOAT.match(text):
        return "number"
    return "string"


def article(word: str) -> str:
    return ("an " if word[0] in "aeiou" else "a ") + word


def walk(node, path, problems):
    if isinstance(node, yaml.MappingNode):
        for key, value in node.value:
            walk(value, f"{path}/{key.value}", problems)
    elif isinstance(node, yaml.SequenceNode):
        for index, item in enumerate(node.value):
            walk(item, f"{path}[{index}]", problems)
    elif isinstance(node, yaml.ScalarNode):
        expected = YAML_TYPES.get(node.tag, node.tag)
        if expected == "nothing":
            return  # yaml-cpp also reads these as null
        got = calamares_type(node.value)
        # Whole numbers written as floats are still the same number.
        if expected == got or (expected, got) == ("number", "integer"):
            return
        problems.append(f"{path}: {node.value!r} looks like {article(expected)}, "
                        f"but Calamares reads it as {article(got)}")


def main() -> int:
    root = Path(__file__).resolve().parents[2] / "packages/calamares-settings-zovelis/calamares"
    files = sorted(glob.glob(f"{root}/**/*.conf", recursive=True)) + \
        sorted(glob.glob(f"{root}/**/*.desc", recursive=True))
    problems = []
    for name in files:
        with open(name, encoding="utf-8") as handle:
            document = yaml.compose(handle)
        found = []
        walk(document, "", found)
        problems += [f"{Path(name).relative_to(root)}: {p}" for p in found]
    for p in problems:
        print(p)
    print(f"checked {len(files)} installer configuration files, {len(problems)} problem(s)")
    return 1 if problems else 0


sys.exit(main())
