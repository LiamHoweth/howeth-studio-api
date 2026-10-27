import assert from "node:assert/strict";
import { describe, it } from "node:test";
import proxyAddress from "proxy-addr";

describe("patched proxy trust preserves address-family boundaries", () => {
  it("does not let IPv4-mapped addresses inherit native IPv6 subnet trust", () => {
    for (const subnets of [["::/64"], ["::/64", "127.0.0.0/8"], ["::ffff:0.0.0.0/80"]]) {
      const trust = proxyAddress.compile(subnets);
      assert.equal(trust("::ffff:198.51.100.1"), false);
      assert.equal(trust("198.51.100.1"), false);
    }
    assert.equal(proxyAddress.compile("::/64")("::1"), true);
  });
  it("retains explicit mapped and ordinary IPv4 trust without trusting unrelated clients", () => {
    for (const subnet of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
      const trust = proxyAddress.compile(subnet);
      assert.equal(trust("10.1.2.3"), true);
      assert.equal(trust("::ffff:10.1.2.3"), true);
      assert.equal(trust("198.51.100.1"), false);
      assert.equal(trust("::ffff:198.51.100.1"), false);
    }
  });
});
