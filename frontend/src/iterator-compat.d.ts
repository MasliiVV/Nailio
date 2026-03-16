interface ArrayIterator<T> extends Iterator<T, undefined, undefined> {
  next(...args: [] | [undefined]): IteratorResult<T, undefined>;
}
