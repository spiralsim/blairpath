// Based on
// https://gist.github.com/Prottoy2938/66849e04b0bac459606059f5f9f3aa1a#file-dijkstra-s-algorithm-js

//helper class for PriorityQueue
class PQNode {
  constructor(value, priority) {
    this.value = value;
    this.priority = priority;
  }
}

class PriorityQueue {
  constructor() {
    this.values = [];
  }
  enqueue(value, priority) {
    let newNode = new PQNode(value, priority);
    this.values.push(newNode);
    this.bubbleUp();
  }
  bubbleUp() {
    let idx = this.values.length - 1;
    const element = this.values[idx];
    while (idx > 0) {
      let parentIdx = Math.floor((idx - 1) / 2);
      let parent = this.values[parentIdx];
      if (element.priority >= parent.priority) break;
      this.values[parentIdx] = element;
      this.values[idx] = parent;
      idx = parentIdx;
    }
  }
  dequeue() {
    const min = this.values[0];
    const end = this.values.pop();
    if (this.values.length > 0) {
      this.values[0] = end;
      this.sinkDown();
    }
    return min;
  }
  sinkDown() {
    let idx = 0;
    const length = this.values.length;
    const element = this.values[0];
    while (true) {
      let leftChildIdx = 2 * idx + 1;
      let rightChildIdx = 2 * idx + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIdx < length) {
        leftChild = this.values[leftChildIdx];
        if (leftChild.priority < element.priority) {
          swap = leftChildIdx;
        }
      }
      if (rightChildIdx < length) {
        rightChild = this.values[rightChildIdx];
        if (
          (swap === null && rightChild.priority < element.priority) ||
          (swap !== null && rightChild.priority < leftChild.priority)
        ) {
          swap = rightChildIdx;
        }
      }
      if (swap === null) break;
      this.values[idx] = this.values[swap];
      this.values[swap] = element;
      idx = swap;
    }
  }
}

//Dijkstra's algorithm only works on a weighted graph.

class Neighbor {
  constructor(vertex, weight) {
    this.vertex = vertexToString(vertex);
    this.weight = weight;
  }
}

class WeightedGraph {
  constructor() {
    this.vertices = {};
    this.adjacencyList = {};
  }
  getVertex(vertex) {
    const str = vertexToString(vertex);
    if (!(str in this.vertices)) {
      this.vertices[str] = vertex;
      this.adjacencyList[str] = [];
    }
    return this.adjacencyList[str];
  }
  addEdge(e) {
    const weight = edgeLength(e);
    this.getVertex(e.endpoint1).push(new Neighbor(e.endpoint2, weight));
    this.getVertex(e.endpoint2).push(new Neighbor(e.endpoint1, weight));
  }
  Dijkstra(start, finish) {
    start = vertexToString(start);
    finish = vertexToString(finish);
    const pq = new PriorityQueue();
    const distances = {};
    const previous = {};
    let path = []; //to return at end
    let smallest;
    // console.log(start, finish);
    //build up initial state
    for (let vertex in this.adjacencyList) {
      if (vertex === start) {
        distances[vertex] = 0;
        pq.enqueue(vertex, 0);
      } else {
        distances[vertex] = Infinity;
        pq.enqueue(vertex, Infinity);
      }
      previous[vertex] = null;
    }
    // as long as there is something to visit
    while (pq.values.length) {
      smallest = pq.dequeue().value;
      if (smallest === finish) {
        //WE ARE DONE
        //BUILD UP PATH TO RETURN AT END
        while (previous[smallest]) {
          path.push(this.vertices[smallest]);
          smallest = previous[smallest];
        }
        break;
      }
      if (smallest || distances[smallest] !== Infinity) {
        for (let neighbor in this.adjacencyList[smallest]) {
          //find neighboring node
          let nextNode = this.adjacencyList[smallest][neighbor];
          //calculate new distance to neighboring node
          let candidate = distances[smallest] + nextNode.weight;
          let nextNeighbor = nextNode.vertex;
          // console.log("candidate: " + candidate);
          // console.log("neighbor: " + nextNeighbor);
          // console.log("dist: " + distances[]);
          if (candidate < distances[nextNeighbor]) {
            //updating new smallest distance to neighbor
            distances[nextNeighbor] = candidate;
            //updating previous - How we got to neighbor
            previous[nextNeighbor] = smallest;
            //enqueue in priority queue with new priority
            pq.enqueue(nextNeighbor, candidate);
          }
        }
      }
    }
    return {
      path: path.concat(this.vertices[smallest]).reverse(),
      distance: distances[finish],
    };
  }
}
