# Eval Demo Web

This is a zero-dependency local demo for dynamic GUI evaluation.

Global evaluation skill file:

- `eval_skill.md` at the root of `eval_demo_web/`

How to use:

1. Open `index.html` directly in a browser.
2. Click `Load Story Package Folder`.
3. Select either:
   - one package folder such as `demo_packages/set1`
   - or the parent folder `demo_packages/` to load `set1` to `set5` together
4. Optionally enter a Yunwu API key.
5. Edit the global evaluation skill and VLM input options on the right.
6. Click `Generate Evaluation Report`.
7. On first run in a supported browser, select the local `eval_skill.md` target once so future runs can sync the file automatically.

Notes:

- No local server is required.
- Story packages are loaded with the browser file picker.
- The page now supports both:
  - `set1` to `set5` style packages (`input.txt + output.json + 4 images per step`)
  - the earlier manifest-based demo package format
- The evaluation skill is global and no longer comes from package-local data files.
- On supported browsers, each run will try to sync the current editor content back to local `eval_skill.md`.
- Reports can be saved directly as local `.md` files.
- Yunwu is called as an OpenAI-compatible endpoint at `https://yunwu.ai/v1/chat/completions`.
- The model default is `gpt-5.4`.
