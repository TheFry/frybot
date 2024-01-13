import { E_CANCELED, Mutex } from "async-mutex";
import { EventEmitter, once } from "events";
import { setTimeout } from "timers";
import { LogType, logConsole } from "./logger";
import { hasProperties } from "./common";

const PUSH_EVENT = 'push';
const CANCEL_EVENT = 'cancel';

export class List<T> {
  head: Node<T> | null;
  tail: Node<T> | null;
  len: number;
  #ac: AbortController;
  #listEvents: EventEmitter;
  #blockMutex: Mutex;

  constructor(data?: T) {
    this.head = data !== undefined ? new Node(null, null, data) : null;
    this.tail = this.head;
    this.len = data !== undefined ? 1 : 0;
    this.#listEvents = new EventEmitter();
    this.#blockMutex = new Mutex();
    this.#ac = new AbortController();
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
    const node = new Node(this.head, null, data);
    this.head.pnode = node;
    this.head = node;
    this.len++;
    this.#listEvents.emit(PUSH_EVENT, PUSH_EVENT);
  }


  lpop(): T | null {
    if(!this.head) return null;
    const data = this.head.data;
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
    const node = new Node(null, this.tail, data);
    this.tail.nnode = node;
    this.tail = node;
    this.len++;
    this.#listEvents.emit(PUSH_EVENT, PUSH_EVENT);
  }


  rpop(): T | null {
    if(!this.tail) return null;
    const data = this.tail.data;
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
        logConsole({ msg: `List Mutex Aquire Error - ${err}`, type: LogType.Error });
        return null;
      }
    }

    const data = this.rpop();
    if(data || timeout === 0) {
      this.#blockMutex.release();
      return data;
    }

    timeout = timeout ? timeout * 1000 : undefined;

    let event;
    let timerId;
    try {
      const listener = once(this.#listEvents, PUSH_EVENT, { signal: this.#ac.signal });
      if(timeout) timerId = setTimeout(() => this.#ac.abort(), timeout);
      event = (await listener)[0];
    } catch(err) {
      if(hasProperties(err, 'code')) {
        const checked = err as { [code: string]: unknown }
        if(checked.code !== 'ABORT_ERR') throw err
      }
      event = CANCEL_EVENT;
    }
    if(timerId) clearTimeout(timerId);
    this.#blockMutex.release();
    return event === PUSH_EVENT ? this.rpop() : null;
  }

  
  abortBlocks() {
    this.#ac.abort();
  }


  listAll(): void {
    let node = this.head;
    while(node) {
      logConsole({ msg: `${node.data}` });
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