package handlers

import (
	"time"
)

const (
	StatePending        = 0
	StateRegistering    = 1
	StateAuthenticating = 2
	StateCompleted      = 3
	StateDenied         = 4

	StateExpirationDuration = 200 * time.Second
)

type State struct {
	status  byte
	content []byte
}

func NewState() *State {
	s := &State{}
	return s
}

func NewStateFromBytes(input []byte) *State {
	if len(input) < 1 {
		panic("invalid state provided")
	}
	s := NewState()
	s.SetStatus(input[0])
	s.SetContent(input[1:])
	return s
}

func (s *State) SetStatus(status byte) {
	s.status = status
}

func (s *State) Status() byte {
	return s.status
}

func (s *State) SetContent(content []byte) {
	s.content = content
}

func (s *State) Bytes() []byte {
	b := append([]byte{}, s.status)
	b = append(b, s.content...)
	return b
}

func (s *State) String() string {
	return StatusToString(s.status)
}

func StatusToString(status byte) string {
	switch status {
	case StatePending:
		return "pending"
	case StateRegistering:
		return "registering"
	case StateAuthenticating:
		return "authenticating"
	case StateCompleted:
		return "completed"
	case StateDenied:
		return "denied"
	default:
		panic("invalid state")
	}
}
