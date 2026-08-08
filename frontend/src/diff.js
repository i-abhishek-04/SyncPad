// Turns a textarea's old->new value change into a minimal set of
// insert/delete operations by trimming common prefix and suffix.
// This covers typing, backspace/delete, and paste -- the realistic
// range of single-user edit events a <textarea> onChange fires.
export function diffToOps(oldText, newText) {
  let start = 0;
  const maxStart = Math.min(oldText.length, newText.length);
  while (start < maxStart && oldText[start] === newText[start]) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  const deletedRange = [start, oldEnd]; // indices into OLD text to delete
  const insertedText = newText.slice(start, newEnd); // text to insert at `start`

  return { deleteStart: deletedRange[0], deleteEnd: deletedRange[1], insertAt: start, insertedText };
}
