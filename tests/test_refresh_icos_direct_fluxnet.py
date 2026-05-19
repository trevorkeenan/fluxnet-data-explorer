import unittest

from scripts import refresh_icos_direct_fluxnet as module


class RefreshIcosDirectFluxnetTests(unittest.TestCase):
    def test_build_candidate_supports_etc_archive_rows(self):
        row = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/test-etc-object"},
                "name": {"value": "ICOSETC_CH-Dav_ARCHIVE_L2.zip"},
                "stationId": {"value": "CH-Dav"},
                "spec": {"value": module.ETC_ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_ICOS},
            }
        )

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["network"], "ICOS")
        self.assertEqual(row["source_network"], "ICOS")
        self.assertEqual(row["processing_lineage"], module.PROCESSING_LINEAGE_OTHER)
        self.assertEqual(row["source_reason"], module.ICOS_DIRECT_SOURCE_REASON)
        self.assertEqual(
            row["download_link"],
            "https://data.icos-cp.eu/licence_accept?ids=%5B%22test-etc-object%22%5D&fileName=ICOSETC_CH-Dav_ARCHIVE_L2.zip",
        )

    def test_choose_best_candidate_prefers_classic_fluxnet_over_etc_archive(self):
        classic = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/classic-object"},
                "name": {"value": "FLX_BE-Bra_FLUXNET2015_FULLSET_1996-2020_beta-3.zip"},
                "stationId": {"value": "BE-Bra"},
                "spec": {"value": module.ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_FLUXNET},
            }
        )
        etc = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/etc-object"},
                "name": {"value": "ICOSETC_BE-Bra_ARCHIVE_L2.zip"},
                "stationId": {"value": "BE-Bra"},
                "spec": {"value": module.ETC_ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_ICOS},
            }
        )

        assert classic is not None
        assert etc is not None
        classic.update(
            {
                "metadata_url": "https://meta.icos-cp.eu/objects/classic-object",
                "latest_version_url": "https://meta.icos-cp.eu/objects/classic-object",
                "coverage_end": "2021-01-01T00:00:00Z",
                "production_end": "2024-08-20T16:36:49Z",
            }
        )
        etc.update(
            {
                "metadata_url": "https://meta.icos-cp.eu/objects/etc-object",
                "latest_version_url": "https://meta.icos-cp.eu/objects/etc-object",
                "first_year": 2021,
                "last_year": 2024,
                "coverage_end": "2025-01-01T00:00:00Z",
                "production_end": "2025-11-23T11:55:21Z",
            }
        )

        best = module.choose_best_candidate([etc, classic])

        self.assertIsNotNone(best)
        assert best is not None
        self.assertEqual(best["object_id"], "classic-object")
        self.assertEqual(best["processing_lineage"], module.PROCESSING_LINEAGE_ONEFLUX)

    def test_choose_best_candidate_prefers_archive_over_resolution_within_classic_family(self):
        archive = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/archive-object"},
                "name": {"value": "FLX_BE-Lcr_FLUXNET2015_FULLSET_2019-2022_1-3.zip"},
                "stationId": {"value": "BE-Lcr"},
                "spec": {"value": module.ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_FLUXNET},
            }
        )
        resolution = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/resolution-object"},
                "name": {"value": "FLX_BE-Lcr_FLUXNET2015_FULLSET_HH_2019-2022_1-3.zip"},
                "stationId": {"value": "BE-Lcr"},
                "spec": {"value": module.PRODUCT_SPEC_URI},
                "project": {"value": module.PROJECT_FLUXNET},
            }
        )

        best = module.choose_best_candidate([resolution, archive])

        self.assertIsNotNone(best)
        assert best is not None
        self.assertEqual(best["object_id"], "archive-object")

    def test_choose_best_candidate_prefers_latest_version_within_etc_family(self):
        older = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/etc-old"},
                "name": {"value": "ICOSETC_UK-AMo_ARCHIVE_L2.zip"},
                "stationId": {"value": "UK-AMo"},
                "spec": {"value": module.ETC_ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_ICOS},
            }
        )
        latest = module.build_candidate(
            {
                "obj": {"value": "https://meta.icos-cp.eu/objects/etc-latest"},
                "name": {"value": "ICOSETC_UK-AMo_ARCHIVE_INTERIM_L2.zip"},
                "stationId": {"value": "UK-AMo"},
                "spec": {"value": module.ETC_ARCHIVE_SPEC_URI},
                "project": {"value": module.PROJECT_ICOS},
            }
        )

        assert older is not None
        assert latest is not None
        older.update(
            {
                "metadata_url": "https://meta.icos-cp.eu/objects/etc-old",
                "latest_version_url": "https://meta.icos-cp.eu/objects/etc-latest",
                "first_year": 2021,
                "last_year": 2024,
                "coverage_end": "2024-10-01T00:00:00Z",
                "production_end": "2024-11-11T15:20:07Z",
            }
        )
        latest.update(
            {
                "metadata_url": "https://meta.icos-cp.eu/objects/etc-latest",
                "latest_version_url": "https://meta.icos-cp.eu/objects/etc-latest",
                "first_year": 2021,
                "last_year": 2025,
                "coverage_end": "2025-10-01T00:00:00Z",
                "production_end": "2025-11-23T11:55:21Z",
            }
        )

        best = module.choose_best_candidate([older, latest])

        self.assertIsNotNone(best)
        assert best is not None
        self.assertEqual(best["object_id"], "etc-latest")
        self.assertEqual(best["processing_lineage"], module.PROCESSING_LINEAGE_OTHER)


if __name__ == "__main__":
    unittest.main()
