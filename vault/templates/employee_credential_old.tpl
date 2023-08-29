{{define "EmployeeCredentialOld"}}
{{ $now := now | unixEpoch }}
{
    "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://www.evidenceledger.eu/2022/credentials/employee/v1"
    ],
    "id": "{{.jti}}",
    "type": ["VerifiableCredential", "EmployeeCredential"],
    "issuer": {
        "id": "{{.issuerDID}}"
    },
    "issuanceDate": "{{ $now }}",
    "validFrom": "{{ $now }}",
    "expirationDate": "{{ add $now 10000 }}",
    "credentialSubject": {
        "id": "{{.subjectDID}}",
        "roles": {{toJson .claims.roles}},
        "name": "{{.claims.name}}",
        "given_name": "{{.claims.given_name}}",
        "family_name": "{{.claims.family_name}}",
        "preferred_username": "{{.claims.preferred_username}}",
        "email": "{{.claims.email}}"
    }
}
{{end}}