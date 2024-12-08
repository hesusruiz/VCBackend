package types

type AuthenticatedUser struct {
	Type                   string
	Email                  string
	OrganizationIdentifier string
	Organization           string
	Country                string
	Name                   string
	SerialNumber           string
}
