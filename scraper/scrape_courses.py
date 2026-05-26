"""
UQ Course Scraper
Scrapes course data from programs-courses.uq.edu.au and saves to JSON.
"""

import json
import os
import re
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://programs-courses.uq.edu.au/course.html?course_code={code}"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODES_FILE = os.path.join(SCRIPT_DIR, "course_codes.txt")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "courses.json")
REQUEST_DELAY = 0.2  # seconds between requests


def load_course_codes():
    """Read course codes from course_codes.txt, one per line."""
    with open(CODES_FILE, "r", encoding="utf-8") as f:
        codes = [line.strip() for line in f if line.strip()]
    return codes


def parse_contact_hours(raw_text):
    """
    Parse class hours string like 'Lecture 2 Hours/Week; Applied Class 2 Hours/Week'
    into a dict like {'lecture': 2, 'tutorial': 0, 'practical': 2}.
    """
    hours = {"lecture": 0, "tutorial": 0, "practical": 0}
    if not raw_text:
        return hours

    raw_lower = raw_text.lower()
    # Match patterns like "Lecture 2 Hours/Week" or "Practical 1 Hour/Week"
    patterns = re.findall(r"([\w\s]+?)\s+(\d+)\s*hours?\s*/\s*week", raw_lower)
    for label, value in patterns:
        label = label.strip()
        num = int(value)
        if "lecture" in label:
            hours["lecture"] = num
        elif "tutorial" in label or "seminar" in label:
            hours["tutorial"] = num
        elif "practical" in label or "applied" in label or "lab" in label or "workshop" in label:
            hours["practical"] = num
        elif "contact" in label:
            # Generic contact hours -- put in lecture as fallback
            hours["lecture"] = num

    return hours


def parse_units(raw_text):
    """Extract numeric units value, defaulting to 2."""
    if not raw_text:
        return 2
    match = re.search(r"(\d+)", raw_text.strip())
    return int(match.group(1)) if match else 2


def extract_metadata(soup):
    """
    Extract course detail fields into a dict.
    The UQ course page currently renders these as h2 labels followed by p values.
    """
    metadata = {}
    detail_labels = {
        "course level",
        "faculty",
        "school",
        "units",
        "duration",
        "attendance mode",
        "class hours",
        "incompatible",
        "prerequisite",
        "recommended prerequisite",
        "assessment methods",
        "course enquiries",
    }

    for heading in soup.find_all("h2"):
        key = heading.get_text(" ", strip=True).lower()
        if key not in detail_labels:
            continue

        values = []
        sibling = heading.find_next_sibling()
        while sibling:
            tag_name = sibling.name if sibling.name else ""
            if tag_name in ("h1", "h2", "h3", "h4"):
                break
            text = sibling.get_text(" ", strip=True)
            if text:
                values.append(text)
            sibling = sibling.find_next_sibling()

        metadata[key] = " ".join(values)
    return metadata


def extract_description(soup):
    """Extract the course description text following the 'Course description' heading."""
    desc_heading = None
    for heading in soup.find_all(["h1", "h2"]):
        if "course description" in heading.get_text(" ", strip=True).lower():
            desc_heading = heading
            break

    if not desc_heading:
        return ""

    parts = []
    sibling = desc_heading.find_next_sibling()
    while sibling:
        tag_name = sibling.name if sibling.name else ""
        # Stop at next heading or section boundary
        if tag_name in ("h1", "h2", "h3", "h4"):
            break
        text = sibling.get_text(" ", strip=True)
        if text:
            parts.append(text)
        sibling = sibling.find_next_sibling()

    return " ".join(parts)


def extract_offerings(soup):
    """
    Extract offerings from the 'Current course offerings' table.
    Returns a list of dicts with semester, campus, mode.
    """
    offerings = []

    # Find the current offerings heading
    offerings_heading = None
    for heading in soup.find_all(["h1", "h2"]):
        if "current course offering" in heading.get_text(" ", strip=True).lower():
            offerings_heading = heading
            break

    if not offerings_heading:
        return offerings

    # Find the next table after the heading
    table = offerings_heading.find_next("table")
    if not table:
        return offerings

    rows = table.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        if len(cells) >= 3:
            semester_text = cells[0].get_text(strip=True)
            location = cells[1].get_text(strip=True)
            mode = cells[2].get_text(strip=True)
            if semester_text.lower() in ("course offerings", "semester"):
                continue

            # Clean semester text: remove date range in parentheses for cleanliness
            semester_clean = re.sub(r"\s*\(.*?\)", "", semester_text).strip()

            offerings.append({
                "semester": semester_clean,
                "campus": location,
                "mode": mode,
            })

    return offerings


def extract_title_and_code(soup, expected_code):
    """
    Extract course title from the h1 tag.
    Expected format: 'Title (CODE)' -- returns just the title part.
    """
    h1 = soup.find("h1")
    course_re = re.compile(rf"^(.*?)\s*\(({re.escape(expected_code)})\)\s*$", re.IGNORECASE)

    for h1 in soup.find_all("h1"):
        full_text = h1.get_text(" ", strip=True)
        # Try to split 'Algorithms and Data Structures (COMP3506)'
        match = course_re.match(full_text)
        if match:
            return match.group(1).strip(), match.group(2).upper()

    return "", expected_code


def abbreviate_faculty(faculty_full):
    """Map full faculty name to short abbreviation."""
    mapping = {
        "engineering, architecture & information technology": "EAIT",
        "engineering, architecture and information technology": "EAIT",
        "science": "Science",
        "business, economics & law": "BEL",
        "business, economics and law": "BEL",
        "humanities & social sciences": "HASS",
        "humanities and social sciences": "HASS",
        "health & behavioural sciences": "HBS",
        "health and behavioural sciences": "HBS",
        "medicine & biomedical sciences": "MBS",
        "medicine and biomedical sciences": "MBS",
    }
    return mapping.get(faculty_full.lower(), faculty_full)


def abbreviate_school(school_full):
    """Map full school name to short abbreviation."""
    mapping = {
        "elec engineering, comp science": "EECS",
        "electrical engineering and computer science": "EECS",
        "information technology and electrical engineering": "ITEE",
        "mathematics & physics": "SMP",
        "mathematics and physics": "SMP",
        "economics": "Economics",
        "business": "Business",
        "law": "Law",
        "political science & international studies": "POLSIS",
        "political science and international studies": "POLSIS",
        "psychology": "Psychology",
        "biological sciences": "SBMS",
        "chemistry & molecular biosciences": "SCMB",
        "chemistry and molecular biosciences": "SCMB",
        "communication & arts": "SCA",
        "communication and arts": "SCA",
        "historical & philosophical inquiry": "SHPI",
        "historical and philosophical inquiry": "SHPI",
        "civil engineering": "Civil",
        "mechanical & mining engineering": "MME",
        "mechanical and mining engineering": "MME",
        "biomedical sciences": "SBMS",
        "music": "Music",
        "education": "Education",
        "earth & environmental sciences": "SEES",
        "earth and environmental sciences": "SEES",
        "agriculture & food sciences": "SAFS",
        "agriculture and food sciences": "SAFS",
    }
    lower = school_full.lower()
    for key, val in mapping.items():
        if key in lower:
            return val
    return school_full


def scrape_course(code, session):
    """Scrape a single course page and return a dict, or None on failure."""
    url = BASE_URL.format(code=code)
    resp = session.get(url, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Check if course exists -- look for the h1 title
    title, parsed_code = extract_title_and_code(soup, code)
    if not title:
        raise ValueError(f"No title found for {code} -- page may not exist")

    metadata = extract_metadata(soup)
    description = extract_description(soup)
    offerings = extract_offerings(soup)

    faculty_raw = metadata.get("faculty", "")
    school_raw = metadata.get("school", "")

    course = {
        "code": code,
        "title": title,
        "units": parse_units(metadata.get("units", "2")),
        "level": metadata.get("course level", ""),
        "faculty": abbreviate_faculty(faculty_raw),
        "school": abbreviate_school(school_raw),
        "description": description,
        "prerequisites": metadata.get("prerequisite", ""),
        "recommended": metadata.get("recommended prerequisite", ""),
        "incompatible": metadata.get("incompatible", ""),
        "assessment": metadata.get("assessment methods", ""),
        "contact_hours": parse_contact_hours(metadata.get("class hours", "")),
        "offerings": offerings,
        "contact_email": metadata.get("course enquiries", ""),
    }

    return course


def main():
    codes = load_course_codes()
    print(f"Loaded {len(codes)} course codes from {CODES_FILE}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "UQ-Course-Scraper/1.0 (Student project)"
    })

    courses = []
    failed = []

    for i, code in enumerate(codes, start=1):
        print(f"[{i}/{len(codes)}] Scraping {code}...", end=" ")
        try:
            course = scrape_course(code, session)
            courses.append(course)
            print("OK")
        except Exception as e:
            print(f"FAILED -- {e}")
            failed.append({"code": code, "error": str(e)})

        if i < len(codes):
            time.sleep(REQUEST_DELAY)

    # Build output with meta section
    output = {
        "meta": {
            "scrape_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_courses": len(courses),
            "failed_courses": len(failed),
            "failed_codes": [f["code"] for f in failed],
        },
        "courses": courses,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nDone. {len(courses)} courses saved to {OUTPUT_FILE}")
    if failed:
        print(f"{len(failed)} courses failed:")
        for f in failed:
            print(f"  {f['code']}: {f['error']}")


if __name__ == "__main__":
    main()
