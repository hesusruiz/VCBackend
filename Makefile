help:
	@echo "Look inside the Makefile to see what commands you can run"

credentials:
	go run cmd/creds/main.go

datamodel:
	go generate ./ent

cleandb:
	rm -f issuer.sqlite
	rm -f verifier.sqlite
	rm -f wallet.sqlite

reset:
	rm -f issuer.sqlite
	rm -f verifier.sqlite
	rm -f wallet.sqlite
	go run cmd/creds/main.go

serve:
	go run .

build:
	go run cmd/faster/faster.go

buildandserve:
	go run cmd/faster/faster.go
	go run .
