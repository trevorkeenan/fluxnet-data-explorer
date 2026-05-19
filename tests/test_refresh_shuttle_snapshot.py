import unittest

from scripts import refresh_shuttle_snapshot as module


def make_row(hub: str, site_id: str) -> dict[str, str]:
    return {
        "data_hub": hub,
        "site_id": site_id,
        "site_name": f"{site_id} Site",
        "network": hub,
        "product_source_network": hub,
        "processing_lineage": "oneflux",
        "igbp": "ENF",
        "first_year": "2001",
        "last_year": "2003",
        "download_link": f"https://example.org/{hub}/{site_id}.zip",
    }


class RefreshShuttleSnapshotTests(unittest.TestCase):
    def test_successful_refresh_marks_sources_fresh(self):
        candidate_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
            make_row("ICOS", "DE-A"),
        ]

        published_rows, source_statuses = module.stabilize_snapshot(
            candidate_rows,
            [],
            {},
            snapshot_updated_at="2026-04-11T05:17:00Z",
            snapshot_updated_date="2026-04-11",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        self.assertEqual(
            [row["site_id"] for row in published_rows],
            ["US-A", "US-B", "DE-A"],
        )
        self.assertEqual(source_statuses["AmeriFlux"]["status"], "fresh")
        self.assertEqual(source_statuses["AmeriFlux"]["last_successful_refresh_date"], "2026-04-11")
        self.assertEqual(source_statuses["AmeriFlux"]["published_site_count"], 2)
        self.assertEqual(source_statuses["ICOS"]["status"], "fresh")
        self.assertEqual(source_statuses["ICOS"]["published_site_count"], 1)

    def test_source_specific_preservation_keeps_previous_hub_when_candidate_is_suspiciously_incomplete(self):
        existing_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
            make_row("AmeriFlux", "US-C"),
            make_row("AmeriFlux", "US-D"),
            make_row("AmeriFlux", "US-E"),
            make_row("ICOS", "DE-A"),
        ]
        candidate_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("ICOS", "DE-A"),
            make_row("ICOS", "DE-B"),
        ]
        existing_meta = {
            "snapshot_updated_at": "2026-04-10T07:02:12Z",
            "snapshot_updated_date": "2026-04-10",
            "source_statuses": {
                "AmeriFlux": {
                    "status": "fresh",
                    "last_successful_refresh_at": "2026-04-10T07:02:12Z",
                    "last_successful_refresh_date": "2026-04-10",
                },
                "ICOS": {
                    "status": "fresh",
                    "last_successful_refresh_at": "2026-04-10T07:02:12Z",
                    "last_successful_refresh_date": "2026-04-10",
                },
            },
        }

        published_rows, source_statuses = module.stabilize_snapshot(
            candidate_rows,
            existing_rows,
            existing_meta,
            snapshot_updated_at="2026-04-11T05:17:00Z",
            snapshot_updated_date="2026-04-11",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        published_by_hub = module.group_rows_by_hub(published_rows)
        self.assertEqual(
            [row["site_id"] for row in published_by_hub["AmeriFlux"]],
            ["US-A", "US-B", "US-C", "US-D", "US-E"],
        )
        self.assertEqual(
            [row["site_id"] for row in published_by_hub["ICOS"]],
            ["DE-A", "DE-B"],
        )
        self.assertEqual(source_statuses["AmeriFlux"]["status"], "carried_forward")
        self.assertEqual(source_statuses["AmeriFlux"]["last_successful_refresh_date"], "2026-04-10")
        self.assertIn("below the 80.0% minimum retention threshold", source_statuses["AmeriFlux"]["reason"])
        self.assertEqual(source_statuses["ICOS"]["status"], "fresh")
        self.assertEqual(source_statuses["ICOS"]["last_successful_refresh_date"], "2026-04-11")

    def test_repeated_outage_runs_keep_last_successful_refresh_metadata(self):
        existing_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
            make_row("AmeriFlux", "US-C"),
            make_row("ICOS", "DE-A"),
        ]
        degraded_candidate_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("ICOS", "DE-A"),
        ]
        baseline_meta = {
            "snapshot_updated_at": "2026-04-10T07:02:12Z",
            "snapshot_updated_date": "2026-04-10",
            "source_statuses": {
                "AmeriFlux": {
                    "status": "fresh",
                    "last_successful_refresh_at": "2026-04-10T07:02:12Z",
                    "last_successful_refresh_date": "2026-04-10",
                }
            },
        }

        published_rows, first_statuses = module.stabilize_snapshot(
            degraded_candidate_rows,
            existing_rows,
            baseline_meta,
            snapshot_updated_at="2026-04-11T05:17:00Z",
            snapshot_updated_date="2026-04-11",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        second_meta = {
            "snapshot_updated_at": "2026-04-11T05:17:00Z",
            "snapshot_updated_date": "2026-04-11",
            "source_statuses": first_statuses,
        }
        second_candidate_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
            make_row("ICOS", "DE-A"),
        ]
        second_published_rows, second_statuses = module.stabilize_snapshot(
            second_candidate_rows,
            published_rows,
            second_meta,
            snapshot_updated_at="2026-04-12T05:17:00Z",
            snapshot_updated_date="2026-04-12",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        self.assertEqual(second_published_rows, published_rows)
        self.assertEqual(second_statuses["AmeriFlux"]["status"], "carried_forward")
        self.assertEqual(second_statuses["AmeriFlux"]["last_successful_refresh_date"], "2026-04-10")

    def test_recovery_marks_carried_forward_source_fresh_again_even_when_rows_match_existing(self):
        existing_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
            make_row("AmeriFlux", "US-C"),
        ]
        existing_meta = {
            "snapshot_updated_at": "2026-04-11T05:17:00Z",
            "snapshot_updated_date": "2026-04-11",
            "source_statuses": {
                "AmeriFlux": {
                    "status": "carried_forward",
                    "last_successful_refresh_at": "2026-04-10T07:02:12Z",
                    "last_successful_refresh_date": "2026-04-10",
                    "published_site_count": 3,
                    "published_row_count": 3,
                    "candidate_site_count": 1,
                    "candidate_row_count": 1,
                    "reason": "AmeriFlux candidate retained 1 of 3 previously published sites.",
                }
            },
        }

        published_rows, source_statuses = module.stabilize_snapshot(
            list(existing_rows),
            existing_rows,
            existing_meta,
            snapshot_updated_at="2026-04-12T05:17:00Z",
            snapshot_updated_date="2026-04-12",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        self.assertEqual(published_rows, existing_rows)
        self.assertEqual(source_statuses["AmeriFlux"]["status"], "fresh")
        self.assertEqual(source_statuses["AmeriFlux"]["last_successful_refresh_date"], "2026-04-12")

    def test_successful_same_content_refresh_updates_source_freshness_metadata(self):
        existing_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("AmeriFlux", "US-B"),
        ]
        existing_meta = {
            "snapshot_updated_at": "2026-04-21T05:17:00Z",
            "snapshot_updated_date": "2026-04-21",
            "source_statuses": {
                "AmeriFlux": {
                    "status": "fresh",
                    "last_successful_refresh_at": "2026-04-21T05:17:00Z",
                    "last_successful_refresh_date": "2026-04-21",
                    "published_site_count": 2,
                    "published_row_count": 2,
                }
            },
        }

        published_rows, source_statuses = module.stabilize_snapshot(
            list(existing_rows),
            existing_rows,
            existing_meta,
            snapshot_updated_at="2026-04-28T05:17:00Z",
            snapshot_updated_date="2026-04-28",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
        )

        self.assertEqual(published_rows, existing_rows)
        self.assertEqual(source_statuses["AmeriFlux"]["status"], "fresh")
        self.assertEqual(source_statuses["AmeriFlux"]["last_successful_refresh_date"], "2026-04-28")

    def test_global_candidate_failure_preserves_existing_rows(self):
        existing_rows = [
            make_row("AmeriFlux", "US-A"),
            make_row("ICOS", "DE-A"),
        ]
        existing_meta = {
            "snapshot_updated_at": "2026-04-10T07:02:12Z",
            "snapshot_updated_date": "2026-04-10",
        }

        published_rows, source_statuses = module.stabilize_snapshot(
            [],
            existing_rows,
            existing_meta,
            snapshot_updated_at="2026-04-11T05:17:00Z",
            snapshot_updated_date="2026-04-11",
            min_site_retention_ratio=0.8,
            min_guarded_site_count=1,
            candidate_error="HTTP 503 from upstream candidate refresh",
        )

        self.assertEqual(published_rows, existing_rows)
        self.assertEqual(source_statuses["AmeriFlux"]["status"], "carried_forward")
        self.assertEqual(source_statuses["ICOS"]["status"], "carried_forward")
        self.assertIn("HTTP 503", source_statuses["AmeriFlux"]["reason"])

    def test_global_candidate_failure_without_existing_snapshot_raises(self):
        with self.assertRaisesRegex(RuntimeError, "Unable to publish Shuttle snapshot"):
            module.stabilize_snapshot(
                [],
                [],
                {},
                snapshot_updated_at="2026-04-11T05:17:00Z",
                snapshot_updated_date="2026-04-11",
                min_site_retention_ratio=0.8,
                min_guarded_site_count=1,
                candidate_error="HTTP 503 from upstream candidate refresh",
            )


if __name__ == "__main__":
    unittest.main()
