# Eval Demo Web

This is a zero-dependency local demo for dynamic GUI evaluation.

How to use:

1. Open `index.html` directly in a browser.
2. Click `Load Story Package Folder`.
3. Select either:
   - one package folder such as `demo_packages/set1`
   - or the parent folder `demo_packages/` to load `set1` to `set5` together
4. Optionally enter a Yunwu API key.
5. Edit the evaluation skill on the right and click `Generate Evaluation Report`.

Notes:

- No local server is required.
- Story packages are loaded with the browser file picker.
- The page now supports both:
  - `set1` to `set5` style packages (`input.txt + output.json + 4 images per step`)
  - the earlier manifest-based demo package format
- Yunwu is called as an OpenAI-compatible endpoint at `https://yunwu.ai/v1/chat/completions`.
- The model default is `gpt-5.4`.
