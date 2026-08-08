"""
Convergence tests for the hand-built RGA CRDT.

Run: python -m pytest test_crdt.py -v
(or just: python test_crdt.py)
"""

from crdt import RGADocument


def replicate_ops(doc_a: RGADocument, doc_b: RGADocument, ops_from_a, ops_from_b):
    """Apply each side's own ops locally (already done by caller before
    calling this), then cross-apply the *other* side's ops as remote ops,
    in reverse order for one of them to prove order-of-delivery doesn't matter."""
    for node in ops_from_b:
        doc_a.apply_remote_insert(node.id, node.origin, node.value)
    for node in reversed(ops_from_a):
        doc_b.apply_remote_insert(node.id, node.origin, node.value)


def test_concurrent_insert_same_position_converges():
    """Two clients both type at the very start of an empty doc at the same
    time. Both characters must survive, and both replicas must end up with
    the identical final string, in the identical order."""
    a = RGADocument()
    b = RGADocument()

    # Both start from an empty doc, both insert at position 0 concurrently.
    node_a = a.local_insert("siteA", after_id=None, value="X")
    node_b = b.local_insert("siteB", after_id=None, value="Y")

    replicate_ops(a, b, [node_a], [node_b])

    assert a.get_text() == b.get_text(), f"diverged: {a.get_text()!r} vs {b.get_text()!r}"
    assert set(a.get_text()) == {"X", "Y"}
    assert len(a.get_text()) == 2
    print(f"OK  concurrent-insert-same-position -> both converge to {a.get_text()!r}")


def test_concurrent_typing_mid_document():
    """Simulate a more realistic scenario: doc already has 'ac', then two
    clients concurrently insert different characters between 'a' and 'c'."""
    a = RGADocument()
    b = RGADocument()

    n1 = a.local_insert("siteA", after_id=None, value="a")
    n2 = a.local_insert("siteA", after_id=n1.id, value="c")
    # sync base state to b
    b.apply_remote_insert(n1.id, n1.origin, n1.value)
    b.apply_remote_insert(n2.id, n2.origin, n2.value)
    assert a.get_text() == b.get_text() == "ac"

    # Now both concurrently insert between 'a' and 'c'
    node_a = a.local_insert("siteA", after_id=n1.id, value="B")   # a wants "aBc"
    node_b = b.local_insert("siteB", after_id=n1.id, value="Z")   # b wants "aZc"

    replicate_ops(a, b, [node_a], [node_b])

    assert a.get_text() == b.get_text(), f"diverged: {a.get_text()!r} vs {b.get_text()!r}"
    assert len(a.get_text()) == 4
    assert set(a.get_text()) == {"a", "c", "B", "Z"}
    print(f"OK  concurrent-mid-document-insert -> both converge to {a.get_text()!r}")


def test_delete_then_insert_referencing_deleted_origin():
    """Deleting a character shouldn't break later inserts whose `origin`
    points at that now-deleted (tombstoned) character."""
    a = RGADocument()
    n1 = a.local_insert("siteA", after_id=None, value="a")
    n2 = a.local_insert("siteA", after_id=n1.id, value="b")
    n3 = a.local_insert("siteA", after_id=n2.id, value="c")
    assert a.get_text() == "abc"

    a.apply_delete(n2.id)  # tombstone 'b'
    assert a.get_text() == "ac"

    # insert after the now-deleted 'b' -- should still land between a and c
    n4 = a.local_insert("siteA", after_id=n2.id, value="X")
    assert a.get_text() == "aXc"
    print(f"OK  insert-after-tombstoned-origin -> {a.get_text()!r}")


def test_out_of_order_delivery_buffers_correctly():
    """A remote insert whose origin hasn't arrived yet must be buffered
    and integrated once its origin shows up -- not dropped or misplaced."""
    a = RGADocument()
    n1 = a.local_insert("siteA", after_id=None, value="a")
    n2 = a.local_insert("siteA", after_id=n1.id, value="b")
    n3 = a.local_insert("siteA", after_id=n2.id, value="c")
    assert a.get_text() == "abc"

    b = RGADocument()
    # deliver out of order: n3 before n2 before n1
    b.apply_remote_insert(n3.id, n3.origin, n3.value)
    assert b.get_text() == ""  # buffered, origin (n2) unseen
    b.apply_remote_insert(n2.id, n2.origin, n2.value)
    assert b.get_text() == ""  # still buffered, origin (n1) unseen
    b.apply_remote_insert(n1.id, n1.origin, n1.value)
    assert b.get_text() == "abc"  # drains pending queue correctly
    print(f"OK  out-of-order-delivery -> {b.get_text()!r}")


if __name__ == "__main__":
    test_concurrent_insert_same_position_converges()
    test_concurrent_typing_mid_document()
    test_delete_then_insert_referencing_deleted_origin()
    test_out_of_order_delivery_buffers_correctly()
    print("\nAll convergence tests passed.")
