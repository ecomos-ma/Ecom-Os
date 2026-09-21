import { describe, it } from 'node:test';
import assert from 'node:assert';
import dotenv from 'dotenv';
dotenv.config();

import { cleanCityName, computeTrigramSimilarity, matchCityFuzzy } from '../src/services/fuzzyCityMatcher.ts';

describe('Fuzzy City Matching Engine', () => {
  it('cleanCityName strips carrier noise words correctly', () => {
    assert.strictEqual(cleanCityName('KENITRA VILLE'), 'kenitra');
    assert.strictEqual(cleanCityName('Casablanca – Centre Ville'), 'casablanca');
    assert.strictEqual(cleanCityName('Agadir'), 'agadir');
  });

  it('computeTrigramSimilarity evaluates phonetic Darija variations to 1.0', () => {
    assert.strictEqual(computeTrigramSimilarity('mrakch', 'Marrakech'), 1.0);
    assert.strictEqual(computeTrigramSimilarity('casa', 'Casablanca – Centre Ville'), 1.0);
    assert.strictEqual(computeTrigramSimilarity('agadire', 'Agadir'), 1.0);
    assert.strictEqual(computeTrigramSimilarity('safi', 'Safi'), 1.0);
    assert.strictEqual(computeTrigramSimilarity('knitra', 'KENITRA VILLE'), 1.0);
  });

  it('computeTrigramSimilarity penalizes sub-locality unlisted villages below threshold', () => {
    const score1 = computeTrigramSimilarity('douar ouled ali 99', 'Ouled Azzouz-dar bouaza');
    const score2 = computeTrigramSimilarity('taznakht el foka', 'Taznakht');
    const score3 = computeTrigramSimilarity('village micro 404', 'Plage David-Bouznika');

    assert.ok(score1 < 0.65, `Expected score1 ${score1} < 0.65`);
    assert.ok(score2 < 0.65, `Expected score2 ${score2} < 0.65`);
    assert.ok(score3 < 0.65, `Expected score3 ${score3} < 0.65`);
  });

  it('matchCityFuzzy evaluates fuzzy resolution against reference cities', async () => {
    const mockOzonCities = [
      { id: 37, name: 'Agadir' },
      { id: 199, name: 'Marrakech' },
      { id: 2174, name: 'Casablanca – Centre Ville' },
      { id: 1089, name: 'KENITRA VILLE' }
    ];

    const resAgadir = await matchCityFuzzy('agadire', 'ozon', 0.65, mockOzonCities);
    assert.strictEqual(resAgadir.matched, true);
    assert.strictEqual(resAgadir.city_name, 'Agadir');
    assert.strictEqual(resAgadir.city_id, 37);

    const resAmbiguous = await matchCityFuzzy('village micro 404', 'ozon', 0.65, mockOzonCities);
    assert.strictEqual(resAmbiguous.matched, false);
    assert.strictEqual(resAmbiguous.city_id, null);
  });
});
