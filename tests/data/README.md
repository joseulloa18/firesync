# Synthetic data fixtures

Every file in `tests/data/fixtures/` is **synthetic**. The coordinates, times,
temperatures, FRP values and detection counts were invented to exercise the
parser and the harmonization functions. They are **not** NASA FIRMS data and
must never be presented as real detections.

The fixture headings also start with a `# SYNTHETIC` comment so the origin is
visible when a file is opened. Replace these files with small, licensed FIRMS
samples during the real-ingestion milestone, keeping any real sample clearly
attributed and separate from the synthetic ones.
