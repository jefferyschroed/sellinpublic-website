#!/usr/bin/env python3
"""
Dependency-free validator for repo-local Sell In Public skills.

This mirrors the system quick validator's SKILL.md frontmatter checks without
requiring PyYAML, which is not guaranteed in the local automation runtime.
"""

import re
import sys
from pathlib import Path


ALLOWED_PROPERTIES = {"name", "description"}
MAX_SKILL_NAME_LENGTH = 64


def strip_quotes(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def parse_frontmatter(frontmatter_text):
    data = {}
    lines = frontmatter_text.splitlines()
    index = 0
    while index < len(lines):
        raw_line = lines[index]
        index += 1
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if raw_line.startswith((" ", "\t")):
            continue
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", raw_line)
        if not match:
            raise ValueError(f"Invalid frontmatter line: {raw_line}")
        key, value = match.groups()
        block_match = re.match(r"^([>|])[-+]?$", value.strip())
        if block_match:
            style = block_match.group(1)
            block_lines = []
            while index < len(lines):
                next_line = lines[index]
                if next_line and not next_line.startswith((" ", "\t")):
                    break
                block_lines.append(next_line.strip())
                index += 1
            if style == "|":
                data[key] = "\n".join(block_lines).strip()
            else:
                paragraphs = []
                current = []
                for line in block_lines:
                    if line:
                        current.append(line)
                    elif current:
                        paragraphs.append(" ".join(current))
                        current = []
                if current:
                    paragraphs.append(" ".join(current))
                data[key] = "\n".join(paragraphs).strip()
            continue
        data[key] = strip_quotes(value)
    return data


def parse_openai_interface(openai_yaml):
    data = {}
    in_interface = False
    for raw_line in openai_yaml.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if raw_line.strip() == "interface:":
            in_interface = True
            continue
        if in_interface:
            if not raw_line.startswith((" ", "\t")):
                break
            match = re.match(r"^\s+([A-Za-z0-9_-]+):\s*(.*)$", raw_line)
            if match:
                key, value = match.groups()
                data[key] = strip_quotes(value)
    return data


def validate_openai_yaml(skill_path, skill_name):
    openai_yaml = skill_path / "agents" / "openai.yaml"
    if not openai_yaml.exists():
        return True, ""
    interface = parse_openai_interface(openai_yaml.read_text(encoding="utf8"))
    required = ["display_name", "short_description", "default_prompt"]
    missing = [key for key in required if not interface.get(key, "").strip()]
    if missing:
        return False, f"agents/openai.yaml missing interface field(s): {', '.join(missing)}"
    if f"${skill_name}" not in interface["default_prompt"]:
        return False, f"agents/openai.yaml default_prompt must mention ${skill_name}"
    return True, ""


def validate_skill(skill_path):
    skill_path = Path(skill_path)
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        return False, "SKILL.md not found"

    content = skill_md.read_text(encoding="utf8")
    if not content.startswith("---"):
        return False, "No YAML frontmatter found"

    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    try:
        frontmatter = parse_frontmatter(match.group(1))
    except ValueError as error:
        return False, str(error)

    unexpected_keys = set(frontmatter) - ALLOWED_PROPERTIES
    if unexpected_keys:
        allowed = ", ".join(sorted(ALLOWED_PROPERTIES))
        unexpected = ", ".join(sorted(unexpected_keys))
        return False, f"Unexpected key(s) in SKILL.md frontmatter: {unexpected}. Allowed properties are: {allowed}"
    missing_or_extra = set(frontmatter) ^ ALLOWED_PROPERTIES
    if missing_or_extra:
        expected = ", ".join(sorted(ALLOWED_PROPERTIES))
        actual = ", ".join(sorted(frontmatter)) or "none"
        return False, f"SKILL.md frontmatter must contain exactly: {expected}. Found: {actual}"

    if "name" not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if "description" not in frontmatter:
        return False, "Missing 'description' in frontmatter"

    name = frontmatter.get("name", "").strip()
    if not name:
        return False, "Name cannot be blank"
    if not re.match(r"^[a-z0-9-]+$", name):
        return False, f"Name '{name}' should be hyphen-case (lowercase letters, digits, and hyphens only)"
    if name.startswith("-") or name.endswith("-") or "--" in name:
        return False, f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens"
    if len(name) > MAX_SKILL_NAME_LENGTH:
        return False, f"Name is too long ({len(name)} characters). Maximum is {MAX_SKILL_NAME_LENGTH} characters."

    description = frontmatter.get("description", "").strip()
    if not description:
        return False, "Description cannot be blank"
    if "<" in description or ">" in description:
        return False, "Description cannot contain angle brackets (< or >)"
    if len(description) > 1024:
        return False, f"Description is too long ({len(description)} characters). Maximum is 1024 characters."

    openai_valid, openai_message = validate_openai_yaml(skill_path, name)
    if not openai_valid:
        return False, openai_message

    return True, "Skill is valid!"


def main():
    if len(sys.argv) != 2:
        print("Usage: python validate_skill.py <skill_directory>")
        return 1

    valid, message = validate_skill(sys.argv[1])
    print(message)
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
