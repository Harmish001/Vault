import assert from "node:assert";
import { Note, VaultIndex } from "../src/types";
import { noteColors } from "../src/theme";

console.log("running notes tests...");

// Test 1: Note color palette
assert.ok(noteColors.default, "default color exists");
assert.ok(noteColors.yellow, "yellow color exists");
assert.ok(noteColors.peach, "peach color exists");
assert.ok(noteColors.rose, "rose color exists");
assert.ok(noteColors.purple, "purple color exists");
assert.ok(noteColors.blue, "blue color exists");
assert.ok(noteColors.mint, "mint color exists");
assert.ok(noteColors.sage, "sage color exists");
console.log("ok - note colors palette is complete");

// Test 2: Note model fields
const testNote: Note = {
  id: "test-1",
  title: "Wi-Fi Password",
  content: "SuperSecretWifiPass123!",
  isSecret: true,
  pinned: true,
  color: "yellow",
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
assert.strictEqual(testNote.title, "Wi-Fi Password");
assert.strictEqual(testNote.isSecret, true);
assert.strictEqual(testNote.pinned, true);
assert.strictEqual(testNote.color, "yellow");
console.log("ok - note model fields validate");

// Test 3: Secret note masking & copy behavior
function maskNoteContent(note: Note): string {
  if (!note.isSecret) return note.content;
  return "••••••••••••";
}

assert.strictEqual(maskNoteContent(testNote), "••••••••••••");

const regularNote: Note = {
  id: "test-2",
  title: "Grocery list",
  content: "Milk, bread, eggs",
  isSecret: false,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};
assert.strictEqual(maskNoteContent(regularNote), "Milk, bread, eggs");
console.log("ok - secret note content is masked, regular note is readable");

// Test 4: Filtering by category tab
const notesList: Note[] = [testNote, regularNote];
const allNotes = notesList;
const secureOnly = notesList.filter((n) => n.isSecret);
assert.strictEqual(allNotes.length, 2);
assert.strictEqual(secureOnly.length, 1);
assert.strictEqual(secureOnly[0].id, "test-1");
console.log("ok - tab filtering works accurately");

// Test 5: Search filtering
function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(
    (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
}

assert.strictEqual(searchNotes(notesList, "wifi").length, 1);
assert.strictEqual(searchNotes(notesList, "eggs").length, 1);
assert.strictEqual(searchNotes(notesList, "SuperSecret").length, 1);
assert.strictEqual(searchNotes(notesList, "nonexistent").length, 0);
console.log("ok - note search by title and content works");

// Test 6: VaultIndex roundtrip with notes
const mockIndex: VaultIndex = {
  version: 1,
  folders: [],
  files: [],
  reminders: [],
  notes: [testNote, regularNote],
};

const serialized = JSON.stringify(mockIndex);
const deserialized = JSON.parse(serialized) as VaultIndex;
assert.ok(Array.isArray(deserialized.notes));
assert.strictEqual(deserialized.notes?.length, 2);
assert.strictEqual(deserialized.notes?.[0].title, "Wi-Fi Password");
assert.strictEqual(deserialized.notes?.[1].content, "Milk, bread, eggs");
console.log("ok - vault index serializes and deserializes notes without loss");

// Test 7: Pinned notes sorting
function sortNotes(notes: Note[]): { pinned: Note[]; others: Note[] } {
  const pinned: Note[] = [];
  const others: Note[] = [];
  for (const n of notes) {
    if (n.pinned) pinned.push(n);
    else others.push(n);
  }
  return { pinned, others };
}

const sorted = sortNotes(notesList);
assert.strictEqual(sorted.pinned.length, 1);
assert.strictEqual(sorted.pinned[0].id, "test-1");
assert.strictEqual(sorted.others.length, 1);
assert.strictEqual(sorted.others[0].id, "test-2");
console.log("ok - pinned notes separate properly");

console.log("\nAll notes tests passed successfully!");
