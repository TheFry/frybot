import { E_CANCELED, Mutex } from "async-mutex";
import { EventEmitter, once } from "events";
import { setTimeout } from "timers/promises";

const PUSH_EVENT = 'push';
const CANCEL_EVENT = 'cancel';

export class List<T> {
  head: Node<T> | null;
  tail: Node<T> | null;
  len: number;
  #listEvents: EventEmitter;
  #blockMutex: Mutex;


  constructor(data?: T) {
    this.head = data !== undefined ? new Node(null, null, data) : null;
    this.tail = this.head;
    this.len = data !== undefined ? 1 : 0;
    this.#listEvents = new EventEmitter();
    this.#blockMutex = new Mutex();
  }


  private newHead(data: T): void {
    this.head = new Node(null, null, data);
    this.tail = this.head;
    this.len = 1;
    this.#listEvents.emit(PUSH_EVENT, PUSH_EVENT);
  }


  lpush(data: T): void {
    if(!this.head) {
      this.newHead(data);
      return;
    }
    let node = new Node(this.head, null, data);
    this.head.pnode = node;
    this.head = node;
    this.len++;
    this.#listEvents.emit(PUSH_EVENT, PUSH_EVENT);
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


  rpush(data: T): void {
    if(!this.tail) {
      this.newHead(data);
      return;
    }
    let node = new Node(null, this.tail, data);
    this.tail.nnode = node;
    this.tail = node;
    this.len++;
    this.#listEvents.emit(PUSH_EVENT, PUSH_EVENT);
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


  async brpop(timeout?: number): Promise<T | null> {
    try {
      await this.#blockMutex.acquire();
    } catch(err) {
      if(err === E_CANCELED) return null;
      else {
        console.log(`List Mutex Aquire Error - ${err}`);
        return null;
      }
    }

    let data = this.rpop();
    if(data || timeout === 0) {
      this.#blockMutex.release();
      return data;
    }

    timeout = timeout ? timeout * 1000 : undefined;
    let promises: Promise<any> [] = [];
    promises.push(once(this.#listEvents, PUSH_EVENT));
    promises.push(once(this.#listEvents, CANCEL_EVENT));
    if(timeout !== undefined) promises.push(setTimeout(timeout, [null]));
    let event = (await Promise.race(promises))[0];
    
    let res;
    if(event === PUSH_EVENT) res = this.rpop();
    else res = null;
    this.#blockMutex.release();
    return res;
  }


  destroy() {
    this.#blockMutex.cancel();
    this.#listEvents.emit(CANCEL_EVENT);
  }


  listAll(): void {
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