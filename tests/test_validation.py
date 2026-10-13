import copy
import importlib.util
import json
import pathlib
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validator', ROOT/'scripts/validate_madplan.py')
validator = importlib.util.module_from_spec(spec); spec.loader.exec_module(validator)
class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.plan=json.loads((ROOT/'public/data/madplan.json').read_text())
        self.prefs=json.loads((ROOT/'.automation/preferences.json').read_text())
        self.flyers=json.loads((ROOT/'public/data/flyers.json').read_text())
    def errors(self): return validator.validate(self.plan,self.prefs,self.flyers)
    def test_current_plan(self): self.assertEqual(self.errors(),[])
    def test_missing_days_are_rejected_without_week42_exception(self):
        self.plan['days']=self.plan['days'][3:]; self.assertIn('Published days differ from selectedDays',self.errors())
    def test_wrong_price(self):
        self.plan['shopping'][0]['items'][0]['offer']['price']=0.01;self.assertIn('Incorrect offer price',self.errors())
    def test_wrong_page(self):
        self.plan['shopping'][0]['items'][0]['offer']['page']=35;self.assertIn('Incorrect offer page',self.errors())
    def test_invented_product(self):
        self.plan['shopping'][0]['items'][0]['offer']['productId']='invented';self.assertTrue(any('No publisher offer evidence' in e for e in self.errors()))
    def test_expired_offer(self):
        self.plan['purchaseAt']='2026-11-01T10:00:00+01:00';self.assertIn('Offer not valid at intended shopping time',self.errors())
    def test_day_request(self):
        self.prefs['dayRequests']={'Mandag':'Millionbøf'};self.assertIn('Day request not fulfilled: Mandag',self.errors())
if __name__=='__main__':unittest.main()
