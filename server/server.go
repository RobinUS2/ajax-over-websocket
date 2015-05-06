// Websocket servers that bundles requests to localhost
// @author Robin Verlangen

package main

import (
	"encoding/json"
	"fmt"
	"golang.org/x/net/websocket"
	"io/ioutil"
	"log"
	"net/http"
	"sync"
)

type AOWRequest struct {
	Id      int64             `json:"id"`
	URI     string            `json:"uri"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers"`
}

type AOWResponse struct {
	Id      int64               `json:"id"`
	Text    string              `json:"text"`
	Status  int                 `json:"status"`
	Headers map[string][]string `json:"headers"`
}

var clientPool sync.Pool

// Echo the data received on the WebSocket.
func EchoServer(ws *websocket.Conn) {
	var err error
	for {
		var reply string

		if err = websocket.Message.Receive(ws, &reply); err != nil {
			fmt.Println("Can't receive")
			break
		}

		fmt.Println("Received from client: " + reply)

		// Json decode
		var req = AOWRequest{}
		if err := json.Unmarshal([]byte(reply), &req); err != nil {
			panic(err)
		}

		// Get client from pool
		pclient := clientPool.Get().(*http.Client)

		// Prepare request
		preq, perr := http.NewRequest(req.Method, fmt.Sprintf("%s", req.URI), nil)
		for k, v := range req.Headers {
			preq.Header.Add(k, v)
		}
		presp, perr := pclient.Do(preq)
		if perr != nil {
			log.Printf("%s\n", perr)

			// Return client to pool
			clientPool.Put(pclient)
			return
		}
		defer presp.Body.Close()
		body, readErr := ioutil.ReadAll(presp.Body)
		if readErr != nil {
			log.Printf("%s\n", readErr)
		}

		// Response wrapper
		var resp = AOWResponse{}
		resp.Id = req.Id
		resp.Text = string(body)
		resp.Status = presp.StatusCode
		resp.Headers = presp.Header
		respBytes, jErr := json.Marshal(resp)
		if jErr != nil {
			panic(jErr)
		}

		// Return client to pool
		clientPool.Put(pclient)

		// Msg
		msg := string(respBytes)

		// Send to client
		fmt.Println("Sending to client: " + msg)
		if err = websocket.Message.Send(ws, msg); err != nil {
			fmt.Println("Can't send")
			break
		}
	}
}

// This example demonstrates a trivial echo server.
func main() {
	log.Println("Starting")

	// Client pool
	clientPool = sync.Pool{
		New: func() interface{} {
			log.Println("New HTTP client")
			ptr := &http.Transport{}
			pclient := &http.Client{Transport: ptr}
			return pclient
		},
	}

	// Webserver
	http.Handle("/", http.FileServer(http.Dir("."))) // Testing only
	//http.Handle("/echo", websocket.Handler(EchoServer)) // Handler

	http.HandleFunc("/echo", func(w http.ResponseWriter, req *http.Request) {
		s := websocket.Server{Handler: websocket.Handler(EchoServer)}
		s.ServeHTTP(w, req)
	})

	err := http.ListenAndServe(":80", nil)
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
	log.Println("Shutting down")
}
