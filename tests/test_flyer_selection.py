import copy
import datetime as dt
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fetch_flyers', ROOT/'scripts/fetch_flyers.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)

def catalog(cid, label, start='2026-10-10T22:00:00+0000', end='2026-10-17T21:59:59+0000', offers=140):
    return dict(id=cid,label=label,run_from=start,run_till=end,offer_count=offers)

class FlyerSelectionTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026,10,17,12,tzinfo=dt.timezone.utc)
        self.current = catalog('main42','Uge 42')
        self.supplement = catalog('insert42','Uge 42 Indstik',start='2026-10-14T22:00:00+0000',offers=12)
        self.next = catalog('main43','Uge 43',start='2026-10-17T22:00:00+0000',end='2026-10-24T21:59:59+0000')
    def test_supplement_does_not_break_main_flyer(self):
        seasonal=catalog('halloween','Halloween',offers=20)
        self.assertEqual(f.select_primary_catalog([self.next,self.supplement,seasonal,self.current],'REMA 1000',self.now)['id'],'main42')
    def test_sunday_midnight_switches_to_new_week(self):
        boundary=dt.datetime(2026,10,17,22,tzinfo=dt.timezone.utc)
        self.assertEqual(f.select_primary_catalog([self.current,self.supplement,self.next],'REMA 1000',boundary)['id'],'main43')
    def test_expired_main_cannot_be_replaced_by_an_insert(self):
        self.supplement['run_till']='2026-10-18T21:59:59+0000'
        with self.assertRaisesRegex(ValueError,'found 0'):
            f.select_primary_catalog([self.current,self.supplement],'REMA 1000',dt.datetime(2026,10,18,12,tzinfo=dt.timezone.utc))
    def test_netto_special_offer_catalogue_is_not_the_weekly(self):
        self.current['label']='Netto uge 42'
        self.assertEqual(f.select_primary_catalog([catalog('special','Netto Halloween',offers=10),self.current],'Netto',self.now)['id'],'main42')
    def test_two_week_coop_flyer(self):
        self.current['label']='Uge 41-42'
        self.assertEqual(f.select_primary_catalog([self.current],'SuperBrugsen',self.now)['id'],'main42')
    def test_ambiguous_main_flyers_still_fail_with_diagnostics(self):
        other=copy.deepcopy(self.current);other['id']='conflicting42'
        with self.assertRaisesRegex(ValueError,'found 2.*main42.*conflicting42'):
            f.select_primary_catalog([self.current,other],'REMA 1000',self.now)

if __name__=='__main__':unittest.main()
