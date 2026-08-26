/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Canonical resume section definitions — the single source of truth for
// what sections the (one, per-account) resume has. The frontend never
// hardcodes section ids/labels/types; it always renders forms from
// GET /api/resume-config. Add, rename, reorder, or remove a section here
// and the whole app (editor, per-job additional-lines form, AI generation,
// rendering) picks it up without any frontend change.
//
// type:
//   'text'    — a single free-text block (e.g. contact info, summary).
//               Always rendered in full; not subject to AI line-selection.
//   'entries' — a repeatable structured item (e.g. one job, one degree),
//               each with its own ordered candidate bullet lines.
//   'list'    — a flat set of candidate lines with no parent entry
//               (e.g. skills).
export const RESUME_SECTIONS = [
  { id: 'header', label: 'Contact Info', type: 'text', order: 0 },
  { id: 'summary', label: 'Summary', type: 'text', order: 1 },
  { id: 'experience', label: 'Professional Experience', type: 'entries', order: 2 },
  { id: 'education', label: 'Education', type: 'entries', order: 3 },
  { id: 'skills', label: 'Additional Information', type: 'list', order: 4 },
];

// Rough one-page approximation used as the hard backstop when trimming a
// generated resume to fit — see selectResumeLines()/trimToBudget() on the
// frontend.
export const TOTAL_CHAR_BUDGET = 8000;

export const getSection = (sectionId) => RESUME_SECTIONS.find(s => s.id === sectionId);
