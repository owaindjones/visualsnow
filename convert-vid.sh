#!/usr/bin/env bash
# Convert and crop video to webm with a max resolution of 1440x1440
input="${1}"
base="$(basename ${input} .mp4)"
output1="${base}.webm"
output2="${base}.jpg"
for output in "${output1}" "${output2}"; do
  ffmpeg -i "${input}" -filter:v "scale=-1:1080,crop=1080:1080" -an "${output}"
done