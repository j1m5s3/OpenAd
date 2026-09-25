# House ads and embed

A **house ad** is your fallback creative: media URL + click URL, stored
off-chain. Serve returns it when there is no serveable **lease** or CPC
**campaign**.

The **embed** is `<open-ad>` on your page. It talks only to the serve API. It
never reads the chain and never loads advertiser files through OpenAd as a
proxy — verified media is served from the API cache.

Place the snippet from Supply on the page that matches the **slot** domain and
size. Demo locally at `http://localhost:5174/demo/`.

See [Embed code](embed-code.md) for the copy-paste snippet, platform-specific
instructions (WordPress, Ghost, Notion/Substack), the "Advertise here" badge
for script-free platforms, and troubleshooting.
