#!/bin/bash
export GOPATH=`pwd`
go get -t -v ./...
go build .
