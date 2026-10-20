# Third-party browser libraries

UMiX Converter vendors the following pinned browser bundles. The source packages were obtained from the npm registry or the package's existing official distribution URL. Their original license files are retained in the corresponding package archives used during the build.

| Library | Version | License | Used for |
| --- | --- | --- | --- |
| pdf-lib | 1.17.1 | MIT | Merge, split, compression, and PDF metadata tools |
| PDF.js | 3.11.174 | Apache-2.0 | PDF parsing, rendering, and text extraction |
| JSZip | 3.10.1 | MIT or GPL-3.0 | ZIP downloads from image/PDF batch tools |
| jsPDF | 2.5.1 | MIT | Image, text, spreadsheet, Word, and presentation PDF output |
| html2canvas | 1.4.1 | MIT | HTML-to-canvas rendering for document conversion |
| Mammoth | 1.6.0 | BSD-2-Clause | Retained legacy DOCX reader bundle; not loaded by Word to PDF |
| docx-preview | 0.4.1 | Apache-2.0 | DOCX page layout rendering in Word to PDF |
| docx | 8.5.0 | MIT | DOCX generation in PDF to Word |
| SheetJS | 0.20.3 | Apache-2.0 | Excel and CSV tools |
| @fefeding/ppt-parser | 1.0.12 | MIT | PowerPoint parsing |

The vendored files are browser distribution bundles only; application conversion logic remains in `js/`. The docx-preview license is included as `docx-preview.LICENSE`.
