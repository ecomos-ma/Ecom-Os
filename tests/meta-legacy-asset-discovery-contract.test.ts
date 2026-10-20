import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const edge = readFileSync("supabase/functions/meta-legacy/index.ts", "utf8");
const studio = readFileSync("src/pages/MetaLaunchStudio.tsx", "utf8");

test("manual Meta launch merges every accessible Page source instead of choosing one", () => {
  assert.match(edge, /promote_pages,business\{id\}/);
  assert.match(edge, /"me\/accounts"/);
  assert.match(edge, /"me\/businesses"/);
  assert.match(edge, /\["owned_pages", "client_pages"\]/);
  assert.match(edge, /\[\.\.\.accountPages, \.\.\.userPages, \.\.\.businessPages\]/);
  assert.doesNotMatch(edge, /accountPages\.length \? accountPages : userPages/);
});

test("manual Meta launch discovers Instagram assets through account and Page links", () => {
  assert.match(edge, /connected_instagram_accounts/);
  assert.match(edge, /\$\{connection\.ad_account_id\}\/instagram_accounts/);
  assert.match(edge, /page\.instagram_business_account/);
  assert.match(edge, /page\.connected_instagram_account/);
  assert.match(edge, /instagram_accounts: \[\.\.\.instagramMap\.values\(\)\]/);
  assert.match(edge, /issues\.instagram/);
  assert.match(edge, /instagramMap\.size === 0 &&/);
  assert.match(studio, /connection\.instagram_accounts\.map/);
  assert.match(studio, /disabled: Boolean\(item\.page_id && item\.page_id !== setup\.pageId\)/);
  assert.doesNotMatch(studio, /assets\.issues\?\.instagram, assets\.issues\?\.pixels/);
  assert.match(studio, /Refresh assets/);
});
