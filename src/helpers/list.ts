export class List<T> {
  head: Node<T> | null;
  tail: Node<T> | null;
  len: number;

  constructor(data?: T) {
    this.head = data !== undefined ? new Node(null, null, data) : null;
    this.tail = this.head;
    this.len = data !== undefined ? 1 : 0;
  }

  private newHead(data: T) {
    this.head = new Node(null, null, data);
    this.tail = this.head;
    this.len = 1;
  }

  lpush(data: T) {
    if(!this.head) {
      this.newHead(data);
      return;
    }
    let node = new Node(this.head, null, data);
    this.head.pnode = node;
    this.head = node;
    this.len++;
  }

  lpop(): T | null {
    if(!this.head) return null;
    let data = this.head.data;
    if(this.head.nnode) this.head.nnode.pnode = null;
    this.head = this.head.nnode;
    this.tail = this.head ? this.tail : null;
    this.len--;
    return data;
  }

  rpush(data: T) {
    if(!this.tail) {
      this.newHead(data);
      return;
    }
    let node = new Node(null, this.tail, data);
    this.tail.nnode = node;
    this.tail = node;
    this.len++;
  }

  rpop(): T | null {
    if(!this.tail) return null;
    let data = this.tail.data;
    if(this.tail.pnode) this.tail.pnode.nnode = null;
    this.tail = this.tail.pnode;
    this.head = this.tail ? this.head : null;
    this.len--;
    return data;
  }

  listAll() {
    let node = this.head;
    while(node) {
      console.log(node.data);
      node = node.nnode;
    }
  }
}


class Node<T> {
  nnode: Node<T> | null;
  pnode: Node<T> | null;
  data: T;

  constructor(nnode: Node<T> | null, pnode: Node<T> | null, data: T) {
    this.nnode = nnode;
    this.pnode = pnode;
    this.data = data;
  }
}