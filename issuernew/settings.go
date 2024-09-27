package issuernew

import "sync"

type Settings struct {
	mux sync.RWMutex

	URL              string
	SamedeviceWallet string
}

func (s *Settings) Validate() error {
	s.mux.Lock()
	defer s.mux.Unlock()

	return nil
}
