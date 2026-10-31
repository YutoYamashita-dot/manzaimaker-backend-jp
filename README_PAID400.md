# ConteMaker iOS paid download — review patch

**Do not deploy without review and live testing.** The attached app and backend were not compiled with Xcode or tested against Apple/Supabase. The existing production app may currently be free. Apple signed AppTransaction from a previously free download may remain valid: verification of a signed app transaction does NOT inherently prove the user paid ¥400; it proves Apple-issued app provenance, not price. Refunds and transaction transfer/replay also require controls. For strict paid-entitlement enforcement, implement an Apple purchase-history/transaction policy and App Attest device binding, account or server-side rate limits.

- api/generate.js: only plan_type=conte_ios_paid AND mode=conte invokes the new verifier. Old ManzaiMaker/Conte Android paths stay unchanged. It passes verifiedContePaid to existing credit functions, using a practical quota of 2,147,483,647 via existing Supabase RPC (not mathematically infinite).
- lib/verifyContePaidDownload.js: signature and app identity verification (Apple root certificates, app ID, bundle ID). Production only by default; set CONTE_PAID_ALLOW_SANDBOX=true for explicit TestFlight/Sandbox tests, not for public deployment.
- ios/: changed client patch forwards Apple's signed AppTransaction on generation.
- Required environment: APPLE_ROOT_CERTS_BASE64, APPLE_CONTE_APP_ID, optional APPLE_CONTE_BUNDLE_ID, CONTE_PAID_ALLOW_SANDBOX for staging only.
- Existing endpoint fallback hosts must all be updated to compatible server versions. Existing iOS 15 installations are not supported by the signed-AppTransaction path.
- This package is an implementation candidate and **not a release-ready security guarantee**. Confirm how old free app users will be treated and test signed AppTransaction values on a paid build.
