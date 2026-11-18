"""Compatibility entry point for the corrected photograph-based LOMSK model."""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().with_name('living_lomsk_rebuild.py')), run_name='__main__')
