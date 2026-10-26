# Training a better grading model (Option 2)

Goal: one model per crop that grades **A / B / C** and says **"not sure / not this fruit"** instead of guessing. Target: 90%+ on a test set the model has never seen.

Work order (about one day for one crop):

| Step                                                     | Who        | Time      |
| -------------------------------------------------------- | ---------- | --------- |
| 1. Write the grading guide (below)                       | 1 person   | 30 min    |
| 2. Buy fruit and take photos                             | everyone   | 2–3 h     |
| 3. Sort photos into folders and zip                      | 1–2 people | 1 h       |
| 4. Run the Colab notebook `train_grader.ipynb`           | 1 person   | 30–40 min |
| 5. Look at mistakes, add photos, run again               | 1 person   | 1 h       |
| 6. Send the downloaded zip so it can be added to the app | —          | —         |

## 1. Grading guide (write one per crop before taking photos)

Everyone labels against the same rules. Example for strawberry:

| Grade     | Rule                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| **A**     | Fully red, glossy, firm, even size (about 25 mm+), green cap fresh, no bruise, no white tip, no mould |
| **B**     | Small white/pink areas, slight size variation, one small soft spot or minor mark, cap slightly wilted |
| **C**     | Bruised, leaking, mouldy spots, misshapen, very soft, or overripe/dark                                |
| **other** | Not a strawberry: empty crate, hand, table, leaves only, a different fruit, very blurry or dark photo |

If two teammates disagree on a photo, delete it. Unclear photos teach the model the wrong thing.

## 2. Taking photos

- **Use the phone you will demo on.**
- **At least 300 photos per class** (A, B, C, other); 500 is better. Keep the classes roughly equal.
- Vary everything: sun, shade, tube light; crate, tarp, palm, steel table; one fruit, a handful, a full crate seen from the top; near and far.
- Fill most of the frame with fruit, like the app's scan box.
- Make your own B and C: buy fresh fruit, and photograph the same batch on day 1, 2, 3 and 4 as it ages. Cheap B/C fruit from a shop also works.
- Fast trick: record 20-second videos turning the fruit, then save frames from them. **Keep all frames of one video in the same folder split** (see the test set below), or the test score will look better than it really is.

## 3. Folder layout and zip

```
strawberry.zip
├── A/        photos of grade A
├── B/
├── C/
└── other/
```

Better: also keep a **test set from a different day or place**. The notebook uses it as the honest final exam:

```
strawberry.zip
├── train/  A/ B/ C/ other/
└── test/   A/ B/ C/ other/     (about 15%, never mixed with train)
```

Upload the zip to Google Drive, in a folder called `ChillChain`.

## 4. Run the notebook

1. Open https://colab.research.google.com → **File → Upload notebook** → choose `ml/train_grader.ipynb`.
2. **Runtime → Change runtime type → T4 GPU** (free).
3. In the first code cell set `CROP` and `ZIP_PATH`, then **Runtime → Run all**.
4. If Colab asks to **restart the session** after installing packages, click **Restart**, then **Run all** again.
5. At the end you get a confusion matrix, a "confidence threshold" table and a download: `grader_<crop>.zip`.

If any cell shows an error, copy the red error text and send it.

## 5. Read the results

- **Test accuracy** is the number that matters, not training accuracy.
- The **confusion matrix** shows which grades get mixed up. A↔B mistakes are normal; A↔C mistakes mean you need more or clearer photos.
- The **threshold table** shows, for example, "if the app only answers when it is ≥ 80% sure, it answers 85% of scans and is right 96% of the time". The app then says "not sure, retake" for the rest.
- To improve: add photos like the ones it got wrong (same light, background, angle), then run again.

## 6. Into the app

Send the downloaded `grader_<crop>.zip`. It contains a TensorFlow.js model (`model.json` plus weight files) and `metadata.json` (labels, image size, test accuracy). It goes into `public/models/<crop>/` and the scan screen loads it for that crop only, averaging several camera frames and refusing low-confidence answers.
