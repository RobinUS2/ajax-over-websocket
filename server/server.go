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
	Id     int64  `json:"id"`
	URI    string `json:"uri"`
	Method string `json:"method"`
}

type AOWResponse struct {
	Id   int64  `json:"id"`
	Text string `json:"text"`
}

// Echo the data received on the WebSocket.
func EchoServer(ws *websocket.Conn) {
	var err error

	// Client
	ptr := &http.Transport{}
	pclient := &http.Client{Transport: ptr}
	var pmux sync.RWMutex

	for {
		var reply string

		if err = websocket.Message.Receive(ws, &reply); err != nil {
			fmt.Println("Can't receive")
			break
		}

		fmt.Println("Received back from client: " + reply)

		// Json decode
		var req = AOWRequest{}
		if err := json.Unmarshal([]byte(reply), &req); err != nil {
			panic(err)
		}

		// Load
		// @todo Have connection pool of clients to better support concurrency
		pmux.Lock()
		preq, perr := http.NewRequest(req.Method, fmt.Sprintf("http://localhost/examples/%s", req.URI), nil)
		//req.Header.Add("X-Forwarded-For", ipAddress)
		presp, perr := pclient.Do(preq)
		if perr != nil {
			log.Printf("%s\n", perr)
			pmux.Unlock()
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
		respBytes, jErr := json.Marshal(resp)
		if jErr != nil {
			panic(jErr)
		}
		pmux.Unlock()

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
	http.Handle("/", http.FileServer(http.Dir(".")))
	http.Handle("/echo", websocket.Handler(EchoServer))
	err := http.ListenAndServe(":80", nil)
	if err != nil {
		panic("ListenAndServe: " + err.Error())
	}
	log.Println("Shutting down")
}
