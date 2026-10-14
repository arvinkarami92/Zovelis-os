# SPDX-License-Identifier: GPL-3.0-or-later
# Zovelis OS build entry points. See docs/BUILDING.md.
#
#   make check      static checks and unit tests (any Linux with Qt 6 / Python)
#   make packages   build the Debian packages            (Debian 13)
#   make iso        build the live/installation ISO      (Debian 13, root)
#   make test-iso   boot the ISO in QEMU and check it    (Debian 13)
#   make artwork    regenerate artwork from branding/    (developers)

.PHONY: all check packages iso test-iso artwork clean

all: packages iso

check:
	./tests/run-static-checks.sh

packages:
	./scripts/build-packages.sh

iso: packages
	sudo ./scripts/build-iso.sh

test-iso:
	./tests/vm/run-vm-tests.sh build/out/zovelis-os-*-amd64.iso

artwork:
	python3 branding/generate_colors.py
	python3 branding/generate.py --svgrender "$(SVGRENDER)"

clean:
	rm -rf build
