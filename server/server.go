// Websocket servers that bundles requests to localhost
// @author Robin Verlangen

package main

import (
	"fmt"
	"golang.org/x/net/websocket"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
)

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

		parts := strings.Split(reply, "\t")

		appHtmlBytes, appHtmlBytesErr := ioutil.ReadFile(fmt.Sprintf("examples/%s", parts[1]))
		if appHtmlBytesErr != nil {
			log.Println("ERR: Failed to open")
			break
		}
		msg := fmt.Sprintf("%s\t%s", parts[0], string(appHtmlBytes))

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
