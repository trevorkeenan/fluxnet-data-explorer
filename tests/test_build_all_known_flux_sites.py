import unittest
from pathlib import Path
from typing import Optional

from scripts import build_all_known_flux_sites as module


def make_spec(
    *,
    source_system: str = "external_docs",
    default_source_network: str = "Test source",
    precedence: int = 20,
    in_explorer: bool = False,
    has_accessible_data: bool = False,
) -> module.SourceSpec:
    return module.SourceSpec(
        path=Path("/tmp/test.csv"),
        display_path="test.csv",
        source_system=source_system,
        default_source_network=default_source_network,
        precedence=precedence,
        in_explorer=in_explorer,
        has_accessible_data=has_accessible_data,
    )


def make_record(fields: dict[str, str], spec: Optional[module.SourceSpec] = None) -> module.RawSiteRecord:
    record = module.build_raw_record(
        module.row_to_normalized_fields(fields),
        spec or make_spec(),
        row_number=2,
        sheet_name="",
    )
    if record is None:
        raise AssertionError("Expected a normalized record")
    return record


def make_accessible_truth(*site_ids: str) -> module.ExplorerAccessibleTruth:
    truth = module.ExplorerAccessibleTruth()
    for site_id in site_ids:
        truth.add_site_identity(site_id=site_id)
    return truth


def make_country_lookup() -> module.CountryBoundaryLookup:
    return module.CountryBoundaryLookup.from_geojson(
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "ISO_A2": "JP",
                        "NAME_EN": "Japan",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [129.0, 30.0],
                                [146.0, 30.0],
                                [146.0, 46.0],
                                [129.0, 46.0],
                                [129.0, 30.0],
                            ]
                        ],
                    },
                },
                {
                    "type": "Feature",
                    "properties": {
                        "ISO_A2": "GB",
                        "NAME_EN": "United Kingdom",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-9.0, 49.0],
                                [3.0, 49.0],
                                [3.0, 61.0],
                                [-9.0, 61.0],
                                [-9.0, 49.0],
                            ]
                        ],
                    },
                },
            ],
        }
    )


class BuildAllKnownFluxSitesTests(unittest.TestCase):
    def test_column_normalization_maps_common_aliases(self):
        record = make_record(
            {
                "Site ID": "US-Var",
                "Station Name": "Vaira Ranch",
                "Country Name": "United States",
                "Lat": "38.4133",
                "Long": "-120.9508",
                "Region": "AmeriFlux",
            }
        )

        self.assertEqual(record.site_id, "US-Var")
        self.assertEqual(record.site_code, "Var")
        self.assertEqual(record.site_name, "Vaira Ranch")
        self.assertEqual(record.country_code, "US")
        self.assertEqual(record.country, "United States")
        self.assertAlmostEqual(record.latitude or 0.0, 38.4133)
        self.assertAlmostEqual(record.longitude or 0.0, -120.9508)
        self.assertEqual(record.source_network, "AmeriFlux")

    def test_lathuile_style_rows_normalize_to_flux_site_fields(self):
        record = make_record(
            {
                "Site": "TW-Tar",
                "Lat": "24.0312",
                "Lon": "120.688",
            },
            make_spec(default_source_network="La Thuile"),
        )

        self.assertEqual(record.site_id, "TW-Tar")
        self.assertEqual(record.site_code, "Tar")
        self.assertEqual(record.country_code, "TW")
        self.assertEqual(record.country, "Taiwan")
        self.assertAlmostEqual(record.latitude or 0.0, 24.0312)
        self.assertAlmostEqual(record.longitude or 0.0, 120.688)
        self.assertEqual(record.source_network, "La Thuile")

    def test_guess_external_network_recognizes_lathuile_workbook(self):
        self.assertEqual(
            module.guess_external_network(Path("/tmp/LaThuile_SiteLatLonClimate.xlsx")),
            "La Thuile",
        )

    def test_duplicate_merging_prefers_exact_site_id(self):
        accessible_spec = make_spec(
            source_system="explorer_accessible",
            default_source_network="FLUXNET-Shuttle",
            precedence=100,
            in_explorer=True,
            has_accessible_data=True,
        )
        external_spec = make_spec(default_source_network="Pingyu")

        records = [
            make_record(
                {
                    "site_id": "US-Var",
                    "site_name": "Vaira Ranch",
                    "country_code": "US",
                    "latitude": "38.4133",
                    "longitude": "-120.9508",
                },
                accessible_spec,
            ),
            make_record(
                {
                    "Site_ID": "US-VAR",
                    "Site_Name": "Vaira Ranch (external)",
                    "lat": "38.41331",
                    "lon": "-120.95079",
                },
                external_spec,
            ),
        ]

        groups = module.merge_records(records)
        canonical_sites, review_rows = module.build_canonical_sites(groups)

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["site_id"], "US-Var")
        self.assertTrue(canonical_sites[0]["in_explorer"])
        self.assertTrue(canonical_sites[0]["has_accessible_data"])
        self.assertFalse(canonical_sites[0]["known_site_only"])
        self.assertEqual(review_rows, [])

    def test_duplicate_merging_uses_country_code_plus_site_code(self):
        accessible_spec = make_spec(
            source_system="explorer_accessible",
            default_source_network="ICOS",
            precedence=100,
            in_explorer=True,
            has_accessible_data=True,
        )

        records = [
            make_record(
                {
                    "site_id": "US-Var",
                    "site_name": "Vaira Ranch",
                    "country_code": "US",
                    "latitude": "38.4133",
                    "longitude": "-120.9508",
                },
                accessible_spec,
            ),
            make_record(
                {
                    "tower_code": "Var",
                    "station_name": "Vaira Ranch field list",
                    "country": "United States",
                    "lat": "38.4134",
                    "lng": "-120.9507",
                }
            ),
        ]

        groups = module.merge_records(records)
        canonical_sites, _ = module.build_canonical_sites(groups)

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["site_id"], "US-Var")
        self.assertEqual(canonical_sites[0]["site_code"], "Var")

    def test_ambiguous_country_code_plus_site_code_is_left_unmerged(self):
        records = [
            make_record(
                {
                    "site_id": "US-Var",
                    "site_name": "Vaira Ranch",
                    "country_code": "US",
                    "latitude": "38.4133",
                    "longitude": "-120.9508",
                }
            ),
            make_record(
                {
                    "tower_code": "Var",
                    "site_name": "Vaira Ranch duplicate?",
                    "country_code": "US",
                    "latitude": "40.0000",
                    "longitude": "-100.0000",
                }
            ),
        ]

        groups = module.merge_records(records)
        canonical_sites, review_rows = module.build_canonical_sites(groups)

        self.assertEqual(len(canonical_sites), 2)
        self.assertEqual(len(review_rows), 1)
        self.assertIn("conflicting coordinates", review_rows[0]["review_reason"])

    def test_country_code_inference_from_country_name(self):
        record = make_record(
            {
                "site_code": "Bal",
                "site_name": "Balcarce BA",
                "country": "Argentina",
                "lat": "-37.7596",
                "lon": "-58.3024",
            }
        )

        self.assertEqual(record.country_code, "AR")
        self.assertEqual(record.country, "Argentina")

    def test_country_code_from_coordinates_uses_country_polygons(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_code": "AKO",
                        "site_name": "Akou green belt",
                        "latitude": "34.786316",
                        "longitude": "134.370861",
                    }
                )
            ]
        )

        canonical_sites, review_rows = module.build_canonical_sites(
            groups,
            country_lookup=make_country_lookup(),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["country_code"], "JP")
        self.assertEqual(canonical_sites[0]["country"], "Japan")
        self.assertFalse(any("country_code could not be inferred confidently" in row["review_reason"] for row in review_rows))

    def test_country_code_from_coordinates_uses_nearest_country_for_near_coastal_points(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_code": "OffshoreJP",
                        "site_name": "Nearshore Japan site",
                        "latitude": "34.5",
                        "longitude": "146.05",
                    }
                )
            ]
        )

        canonical_sites, review_rows = module.build_canonical_sites(
            groups,
            country_lookup=make_country_lookup(),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["country_code"], "JP")
        self.assertFalse(any("country_code could not be inferred confidently" in row["review_reason"] for row in review_rows))

    def test_gb_country_codes_are_canonicalized_to_uk(self):
        record = make_record(
            {
                "site_id": "UK-Ham",
                "country_code": "GB",
                "country": "United Kingdom",
            }
        )

        self.assertEqual(record.country_code, "UK")
        self.assertEqual(record.country, "United Kingdom")

    def test_uk_coordinate_lookup_uses_uk_code_alias(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_id": "UK-Ham",
                        "site_name": "Hampshire",
                        "latitude": "51.153533",
                        "longitude": "-0.8583",
                        "country_code": "GB",
                    }
                )
            ]
        )

        canonical_sites, review_rows = module.build_canonical_sites(
            groups,
            country_lookup=make_country_lookup(),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["country_code"], "UK")
        self.assertFalse(any("ambiguous country_code across contributing records" in row["review_reason"] for row in review_rows))

    def test_country_prefixed_site_id_is_adopted_over_bare_code_duplicate(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_id": "TW-GDP",
                        "site_code": "GDP",
                        "country_code": "TW",
                        "latitude": "25.116667",
                        "longitude": "121.466666",
                    }
                ),
                make_record(
                    {
                        "site_id": "GDP",
                        "site_name": "Guandu Nature Park Flux Station",
                        "latitude": "25.116667",
                        "longitude": "121.466666",
                    }
                ),
            ]
        )

        canonical_sites, review_rows = module.build_canonical_sites(
            groups,
            country_lookup=make_country_lookup(),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["site_id"], "TW-GDP")
        self.assertEqual(canonical_sites[0]["site_code"], "GDP")
        self.assertEqual(canonical_sites[0]["site_name"], "Guandu Nature Park Flux Station")
        self.assertEqual(review_rows, [])

    def test_review_rows_include_coordinate_details_for_conflicting_coordinates(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_id": "US-WI9",
                        "site_name": "Young Jack pine (YJP)",
                        "country_code": "US",
                        "latitude": "46.7385",
                        "longitude": "-91.0746",
                    }
                ),
                make_record(
                    {
                        "site_id": "US-WI9",
                        "site_name": "Young Jack pine (YJP)",
                        "country_code": "US",
                        "latitude": "46.6188",
                        "longitude": "-91.0814",
                    }
                ),
            ]
        )

        _, review_rows = module.build_canonical_sites(groups)

        self.assertEqual(len(review_rows), 1)
        self.assertIn("max_distance_km=", review_rows[0]["coordinate_details"])
        self.assertIn("(46.7385, -91.0746)", review_rows[0]["coordinate_details"])
        self.assertIn("(46.6188, -91.0814)", review_rows[0]["coordinate_details"])

    def test_known_site_only_flag_is_preserved_for_external_only_sites(self):
        external_only = make_record(
            {
                "Site_ID": "JP-AKO",
                "Site_Name": "Ako reference tower",
                "Country": "Japan",
                "lat": "34.786316",
                "lon": "134.370861",
            }
        )

        accessible_and_external = [
            make_record(
                {
                    "site_id": "US-Var",
                    "site_name": "Vaira Ranch",
                    "country_code": "US",
                    "latitude": "38.4133",
                    "longitude": "-120.9508",
                },
                make_spec(
                    source_system="explorer_accessible",
                    default_source_network="FLUXNET-Shuttle",
                    precedence=100,
                    in_explorer=True,
                    has_accessible_data=True,
                ),
            ),
            make_record(
                {
                    "site_id": "US-Var",
                    "site_name": "Vaira Ranch copy",
                    "country": "United States",
                    "lat": "38.41331",
                    "lon": "-120.95081",
                }
            ),
        ]

        groups = module.merge_records([external_only] + accessible_and_external)
        canonical_sites, _ = module.build_canonical_sites(groups)
        sites_by_id = {row["site_id"]: row for row in canonical_sites}

        self.assertTrue(sites_by_id["JP-AKO"]["known_site_only"])
        self.assertFalse(sites_by_id["JP-AKO"]["has_accessible_data"])
        self.assertFalse(sites_by_id["JP-AKO"]["in_explorer"])

        self.assertFalse(sites_by_id["US-Var"]["known_site_only"])
        self.assertTrue(sites_by_id["US-Var"]["has_accessible_data"])
        self.assertTrue(sites_by_id["US-Var"]["in_explorer"])

    def test_fluxnet2015_backed_accessible_site_is_not_known_site_only(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "site_id": "US-BLO",
                        "site_name": "Blodgett Forest",
                        "country": "United States",
                        "latitude": "38.8953",
                        "longitude": "-120.6328",
                    },
                    make_spec(
                        source_system="explorer_repo_metadata",
                        default_source_network="FLUXNET2015",
                        precedence=50,
                    ),
                )
            ]
        )

        canonical_sites, _ = module.build_canonical_sites(
            groups,
            accessible_truth=make_accessible_truth("US-Blo"),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["site_id"], "US-BLO")
        self.assertTrue(canonical_sites[0]["has_accessible_data"])
        self.assertTrue(canonical_sites[0]["in_explorer"])
        self.assertFalse(canonical_sites[0]["known_site_only"])

    def test_accessible_truth_matches_country_plus_site_code_when_site_id_is_missing(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "tower_code": "Blo",
                        "station_name": "Blodgett Forest",
                        "country": "United States",
                        "latitude": "38.8953",
                        "longitude": "-120.6328",
                    }
                )
            ]
        )

        canonical_sites, _ = module.build_canonical_sites(
            groups,
            accessible_truth=make_accessible_truth("US-Blo"),
        )

        self.assertEqual(len(canonical_sites), 1)
        self.assertEqual(canonical_sites[0]["site_code"], "Blo")
        self.assertTrue(canonical_sites[0]["has_accessible_data"])
        self.assertTrue(canonical_sites[0]["in_explorer"])
        self.assertFalse(canonical_sites[0]["known_site_only"])

    def test_known_site_only_implies_no_accessible_data_with_accessible_truth(self):
        groups = module.merge_records(
            [
                make_record(
                    {
                        "Site_ID": "JP-AKO",
                        "Site_Name": "Ako reference tower",
                        "Country": "Japan",
                        "lat": "34.786316",
                        "lon": "134.370861",
                    }
                ),
                make_record(
                    {
                        "site_id": "US-BLO",
                        "site_name": "Blodgett Forest",
                        "country": "United States",
                        "latitude": "38.8953",
                        "longitude": "-120.6328",
                    }
                ),
            ]
        )

        canonical_sites, _ = module.build_canonical_sites(
            groups,
            accessible_truth=make_accessible_truth("US-Blo"),
        )

        self.assertEqual(len(canonical_sites), 2)
        for site in canonical_sites:
            if site["known_site_only"]:
                self.assertFalse(site["has_accessible_data"])


if __name__ == "__main__":
    unittest.main()
