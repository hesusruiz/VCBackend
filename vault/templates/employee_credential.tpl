{{define "dsba.credentials.presentation.Employee" -}}
{{ $now := now | unixEpoch -}}
{
    "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://www.evidenceledger.eu/2022/credentials/employee/v1"
    ],
    "id": "{{.jti}}",
    "type": ["VerifiableCredential", "dsba.credentials.presentation.Employee"],
    "issuer": {
        "id": "{{.issuerDID}}"
    },
    "issuanceDate": "{{ $now }}",
    "validFrom": "{{ $now }}",
    "expirationDate": "{{ add $now 10000 }}",
    "credentialSubject": {{toPrettyJson .claims}}
}
{{end}}
