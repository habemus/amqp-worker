# Why not allow multiple worker functions (e.g. worker methods) to be exposed?

During development we've briefly studied the possibility of allowing multiple
methods to be exposed through a single h-worker. That was discarded due to the
idea that workers should perform resource-intensive tasks (e.g. builds) and
that the exposure of multiple tasks through the same worker might incentivize
designs that do not perform well.

That is because for a worker to expose multiple methods to their clients there
are two strategies, discussed below:

1. Multiple queues - one queue for each `workerMethod`

The idea is simple: one direct-exchange for the worker and its client to communicate, 
multiple queues, one for each method. The problem is that message consuming works on a
queue basis: one consumer per queue. That way, we have no straightforward manner of 
impeding the worker from executing two (or more) workerMethods at once
(one from each queue). That is not a good path to go, as the parallellism does not 
explicitly benefit the worker nor the client.

2. One single queue - define custom applicaiton-level protocol for defining the method requested

In this mode, the message would bear itself the information on which workerMethod should
be executed. This way the worker would only consume from a single queue and before
passing the message to the workerMethod, would parse it and decide which workerMethod
should be executed. It prevents parallel jobs, as only one queue consumer exists.
The problem with this approach is that the rabbitMQ queue becomes non-semantic at all,
as it cannot be assumed that a queue represents workload requests for a given method
without introspecting into each message. Does not seem to be a good path to go.

Remaining with the single-worker-fn maintains a simple API and is quite clear about
the intentions of worker and client.

# What is the difference between h-worker and intercomm?

Both modules are frameworks for remote procedure calling and definitely have great
function overlapping. For the moment (20 Sep 2016), though, intercomm is targeted
at providing a thin abstraction layer espefically for real-time RPC. By 'real-time RPC'
we mean procedure calls that expect answers within a second (or some seconds at most).
Thus, intercomm stores the promises for each RPC call in memory and waits for the
response before removing the reference to the promise from memory. H-worker, on the
other hand does not keep reference to call ids nor promises, it is stateless: once
messages are sent from the client, it completely forgets about them, and once responses
arrive the client does not try to match them to the request, but emits an event that
should be handled by the h-worker client's consumer. Furthermore, h-worker has built in
the idea that jobs might send `intermediate` messages (infoLog, warningLog, errorLog) that do not clearly fit in a simple request and response paradigm.

Another difference is that h-worker is used for server-side stuff, while intercomm is
completely agnostic. On that end, it is very important to note that h-worker is tightly
coupled to rabbit-mq and as such, uses much of AMQP protocol (which has many overlaps
with the intercomm's custom protocol (json-message)).

In the future, h-worker and intercomm might be merged somehow, but for the time being
it does not seem to be a good idea trying to do so.

The main benefit of this merge would be the universal message delivery system. The
same format sent from the browser would be used inside rabbitMq, REST API's and more.
(That would be huge!)

# docker run rabbitmq
`docker run -d --hostname my-rabbit --name my-rabbit -p 4369:4369 -p 5671:5671 -p 5672:5672 -p 15672:15672 -p 25672:25672 rabbitmq:3-management`
