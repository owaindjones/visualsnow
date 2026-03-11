#!/usr/bin/env bash

this_dir="$(dirname ${0})"
source "${this_dir}/../.venv/bin/activate"
python -m https.server -b 0.0.0.0 8000
