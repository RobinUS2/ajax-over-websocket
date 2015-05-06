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
)

type AOWRequest struct {
	Id  int64  `json:"id"`
	URI string `json:"uri"`
}

type AOWResponse struct {
	Id   int64  `json:"id"`
	Text string `json:"text"`
}

// Echo the data received on the WebSocket.
func EchoServer(ws *websocket.Conn) {
	var err error

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
		appHtmlBytes, appHtmlBytesErr := ioutil.ReadFile(fmt.Sprintf("examples/%s", req.URI))
		if appHtmlBytesErr != nil {
			log.Println("ERR: Failed to open")
			break
		}

		// Response wrapper
		var resp = AOWResponse{}
		resp.Id = req.Id
		resp.Text = string(appHtmlBytes)
		respBytes, jErr := json.Marshal(resp)
		if jErr != nil {
			panic(jErr)
		}

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
