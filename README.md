# nioquant

GitHub Pages website for [nioquant](https://nioquant.com)

The homepage links to `/software/` and `/3d-modeling/`. Existing app routes are unchanged. Modeling packages and concept licence interests can be saved locally and reviewed at `/contact/`.

Inquiry sending requires a separate mail endpoint. See [backend setup](backend/README.md). Until configured, the contact page shows a read-only preview and a direct email contact option; it never claims an inquiry was sent.

Run the mail validation tests with `node --test tests/*.test.mjs`. Preview the static site with `python3 -m http.server 8765 --bind 127.0.0.1`.
