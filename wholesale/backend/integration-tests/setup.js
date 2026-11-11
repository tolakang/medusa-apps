const { MetadataStorage } = require("@mikro-orm/core");
MetadataStorage.clear();

// The suites read the catalog as a guest in their setup. The sign-in rule
// for product routes (F-068) has its own suite, catalog-login.spec.ts.
process.env.WHOLESALE_REQUIRE_LOGIN = process.env.WHOLESALE_REQUIRE_LOGIN || "false";
