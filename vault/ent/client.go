// Code generated by ent, DO NOT EDIT.

package ent

import (
	"context"
	"fmt"
	"log"

	"github.com/evidenceledger/vcdemo/vault/ent/migrate"

	"github.com/evidenceledger/vcdemo/vault/ent/credential"
	"github.com/evidenceledger/vcdemo/vault/ent/did"
	"github.com/evidenceledger/vcdemo/vault/ent/user"
	"github.com/evidenceledger/vcdemo/vault/ent/webauthncredential"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqlgraph"
)

// Client is the client that holds all ent builders.
type Client struct {
	config
	// Schema is the client for creating, migrating and dropping schema.
	Schema *migrate.Schema
	// Credential is the client for interacting with the Credential builders.
	Credential *CredentialClient
	// DID is the client for interacting with the DID builders.
	DID *DIDClient
	// User is the client for interacting with the User builders.
	User *UserClient
	// WebauthnCredential is the client for interacting with the WebauthnCredential builders.
	WebauthnCredential *WebauthnCredentialClient
}

// NewClient creates a new client configured with the given options.
func NewClient(opts ...Option) *Client {
	cfg := config{log: log.Println, hooks: &hooks{}}
	cfg.options(opts...)
	client := &Client{config: cfg}
	client.init()
	return client
}

func (c *Client) init() {
	c.Schema = migrate.NewSchema(c.driver)
	c.Credential = NewCredentialClient(c.config)
	c.DID = NewDIDClient(c.config)
	c.User = NewUserClient(c.config)
	c.WebauthnCredential = NewWebauthnCredentialClient(c.config)
}

// Open opens a database/sql.DB specified by the driver name and
// the data source name, and returns a new client attached to it.
// Optional parameters can be added for configuring the client.
func Open(driverName, dataSourceName string, options ...Option) (*Client, error) {
	switch driverName {
	case dialect.MySQL, dialect.Postgres, dialect.SQLite:
		drv, err := sql.Open(driverName, dataSourceName)
		if err != nil {
			return nil, err
		}
		return NewClient(append(options, Driver(drv))...), nil
	default:
		return nil, fmt.Errorf("unsupported driver: %q", driverName)
	}
}

// Tx returns a new transactional client. The provided context
// is used until the transaction is committed or rolled back.
func (c *Client) Tx(ctx context.Context) (*Tx, error) {
	if _, ok := c.driver.(*txDriver); ok {
		return nil, fmt.Errorf("ent: cannot start a transaction within a transaction")
	}
	tx, err := newTx(ctx, c.driver)
	if err != nil {
		return nil, fmt.Errorf("ent: starting a transaction: %w", err)
	}
	cfg := c.config
	cfg.driver = tx
	return &Tx{
		ctx:                ctx,
		config:             cfg,
		Credential:         NewCredentialClient(cfg),
		DID:                NewDIDClient(cfg),
		User:               NewUserClient(cfg),
		WebauthnCredential: NewWebauthnCredentialClient(cfg),
	}, nil
}

// BeginTx returns a transactional client with specified options.
func (c *Client) BeginTx(ctx context.Context, opts *sql.TxOptions) (*Tx, error) {
	if _, ok := c.driver.(*txDriver); ok {
		return nil, fmt.Errorf("ent: cannot start a transaction within a transaction")
	}
	tx, err := c.driver.(interface {
		BeginTx(context.Context, *sql.TxOptions) (dialect.Tx, error)
	}).BeginTx(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("ent: starting a transaction: %w", err)
	}
	cfg := c.config
	cfg.driver = &txDriver{tx: tx, drv: c.driver}
	return &Tx{
		ctx:                ctx,
		config:             cfg,
		Credential:         NewCredentialClient(cfg),
		DID:                NewDIDClient(cfg),
		User:               NewUserClient(cfg),
		WebauthnCredential: NewWebauthnCredentialClient(cfg),
	}, nil
}

// Debug returns a new debug-client. It's used to get verbose logging on specific operations.
//
//	client.Debug().
//		Credential.
//		Query().
//		Count(ctx)
func (c *Client) Debug() *Client {
	if c.debug {
		return c
	}
	cfg := c.config
	cfg.driver = dialect.Debug(c.driver, c.log)
	client := &Client{config: cfg}
	client.init()
	return client
}

// Close closes the database connection and prevents new queries from starting.
func (c *Client) Close() error {
	return c.driver.Close()
}

// Use adds the mutation hooks to all the entity clients.
// In order to add hooks to a specific client, call: `client.Node.Use(...)`.
func (c *Client) Use(hooks ...Hook) {
	c.Credential.Use(hooks...)
	c.DID.Use(hooks...)
	c.User.Use(hooks...)
	c.WebauthnCredential.Use(hooks...)
}

// CredentialClient is a client for the Credential schema.
type CredentialClient struct {
	config
}

// NewCredentialClient returns a client for the Credential from the given config.
func NewCredentialClient(c config) *CredentialClient {
	return &CredentialClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `credential.Hooks(f(g(h())))`.
func (c *CredentialClient) Use(hooks ...Hook) {
	c.hooks.Credential = append(c.hooks.Credential, hooks...)
}

// Create returns a builder for creating a Credential entity.
func (c *CredentialClient) Create() *CredentialCreate {
	mutation := newCredentialMutation(c.config, OpCreate)
	return &CredentialCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of Credential entities.
func (c *CredentialClient) CreateBulk(builders ...*CredentialCreate) *CredentialCreateBulk {
	return &CredentialCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for Credential.
func (c *CredentialClient) Update() *CredentialUpdate {
	mutation := newCredentialMutation(c.config, OpUpdate)
	return &CredentialUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *CredentialClient) UpdateOne(cr *Credential) *CredentialUpdateOne {
	mutation := newCredentialMutation(c.config, OpUpdateOne, withCredential(cr))
	return &CredentialUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *CredentialClient) UpdateOneID(id string) *CredentialUpdateOne {
	mutation := newCredentialMutation(c.config, OpUpdateOne, withCredentialID(id))
	return &CredentialUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for Credential.
func (c *CredentialClient) Delete() *CredentialDelete {
	mutation := newCredentialMutation(c.config, OpDelete)
	return &CredentialDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *CredentialClient) DeleteOne(cr *Credential) *CredentialDeleteOne {
	return c.DeleteOneID(cr.ID)
}

// DeleteOne returns a builder for deleting the given entity by its id.
func (c *CredentialClient) DeleteOneID(id string) *CredentialDeleteOne {
	builder := c.Delete().Where(credential.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &CredentialDeleteOne{builder}
}

// Query returns a query builder for Credential.
func (c *CredentialClient) Query() *CredentialQuery {
	return &CredentialQuery{
		config: c.config,
	}
}

// Get returns a Credential entity by its id.
func (c *CredentialClient) Get(ctx context.Context, id string) (*Credential, error) {
	return c.Query().Where(credential.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *CredentialClient) GetX(ctx context.Context, id string) *Credential {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryUser queries the user edge of a Credential.
func (c *CredentialClient) QueryUser(cr *Credential) *UserQuery {
	query := &UserQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := cr.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(credential.Table, credential.FieldID, id),
			sqlgraph.To(user.Table, user.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, credential.UserTable, credential.UserColumn),
		)
		fromV = sqlgraph.Neighbors(cr.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *CredentialClient) Hooks() []Hook {
	return c.hooks.Credential
}

// DIDClient is a client for the DID schema.
type DIDClient struct {
	config
}

// NewDIDClient returns a client for the DID from the given config.
func NewDIDClient(c config) *DIDClient {
	return &DIDClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `did.Hooks(f(g(h())))`.
func (c *DIDClient) Use(hooks ...Hook) {
	c.hooks.DID = append(c.hooks.DID, hooks...)
}

// Create returns a builder for creating a DID entity.
func (c *DIDClient) Create() *DIDCreate {
	mutation := newDIDMutation(c.config, OpCreate)
	return &DIDCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of DID entities.
func (c *DIDClient) CreateBulk(builders ...*DIDCreate) *DIDCreateBulk {
	return &DIDCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for DID.
func (c *DIDClient) Update() *DIDUpdate {
	mutation := newDIDMutation(c.config, OpUpdate)
	return &DIDUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *DIDClient) UpdateOne(d *DID) *DIDUpdateOne {
	mutation := newDIDMutation(c.config, OpUpdateOne, withDID(d))
	return &DIDUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *DIDClient) UpdateOneID(id string) *DIDUpdateOne {
	mutation := newDIDMutation(c.config, OpUpdateOne, withDIDID(id))
	return &DIDUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for DID.
func (c *DIDClient) Delete() *DIDDelete {
	mutation := newDIDMutation(c.config, OpDelete)
	return &DIDDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *DIDClient) DeleteOne(d *DID) *DIDDeleteOne {
	return c.DeleteOneID(d.ID)
}

// DeleteOne returns a builder for deleting the given entity by its id.
func (c *DIDClient) DeleteOneID(id string) *DIDDeleteOne {
	builder := c.Delete().Where(did.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &DIDDeleteOne{builder}
}

// Query returns a query builder for DID.
func (c *DIDClient) Query() *DIDQuery {
	return &DIDQuery{
		config: c.config,
	}
}

// Get returns a DID entity by its id.
func (c *DIDClient) Get(ctx context.Context, id string) (*DID, error) {
	return c.Query().Where(did.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *DIDClient) GetX(ctx context.Context, id string) *DID {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryUser queries the user edge of a DID.
func (c *DIDClient) QueryUser(d *DID) *UserQuery {
	query := &UserQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := d.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(did.Table, did.FieldID, id),
			sqlgraph.To(user.Table, user.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, did.UserTable, did.UserColumn),
		)
		fromV = sqlgraph.Neighbors(d.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *DIDClient) Hooks() []Hook {
	return c.hooks.DID
}

// UserClient is a client for the User schema.
type UserClient struct {
	config
}

// NewUserClient returns a client for the User from the given config.
func NewUserClient(c config) *UserClient {
	return &UserClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `user.Hooks(f(g(h())))`.
func (c *UserClient) Use(hooks ...Hook) {
	c.hooks.User = append(c.hooks.User, hooks...)
}

// Create returns a builder for creating a User entity.
func (c *UserClient) Create() *UserCreate {
	mutation := newUserMutation(c.config, OpCreate)
	return &UserCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of User entities.
func (c *UserClient) CreateBulk(builders ...*UserCreate) *UserCreateBulk {
	return &UserCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for User.
func (c *UserClient) Update() *UserUpdate {
	mutation := newUserMutation(c.config, OpUpdate)
	return &UserUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *UserClient) UpdateOne(u *User) *UserUpdateOne {
	mutation := newUserMutation(c.config, OpUpdateOne, withUser(u))
	return &UserUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *UserClient) UpdateOneID(id string) *UserUpdateOne {
	mutation := newUserMutation(c.config, OpUpdateOne, withUserID(id))
	return &UserUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for User.
func (c *UserClient) Delete() *UserDelete {
	mutation := newUserMutation(c.config, OpDelete)
	return &UserDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *UserClient) DeleteOne(u *User) *UserDeleteOne {
	return c.DeleteOneID(u.ID)
}

// DeleteOne returns a builder for deleting the given entity by its id.
func (c *UserClient) DeleteOneID(id string) *UserDeleteOne {
	builder := c.Delete().Where(user.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &UserDeleteOne{builder}
}

// Query returns a query builder for User.
func (c *UserClient) Query() *UserQuery {
	return &UserQuery{
		config: c.config,
	}
}

// Get returns a User entity by its id.
func (c *UserClient) Get(ctx context.Context, id string) (*User, error) {
	return c.Query().Where(user.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *UserClient) GetX(ctx context.Context, id string) *User {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryDids queries the dids edge of a User.
func (c *UserClient) QueryDids(u *User) *DIDQuery {
	query := &DIDQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := u.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(user.Table, user.FieldID, id),
			sqlgraph.To(did.Table, did.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, user.DidsTable, user.DidsColumn),
		)
		fromV = sqlgraph.Neighbors(u.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryCredentials queries the credentials edge of a User.
func (c *UserClient) QueryCredentials(u *User) *CredentialQuery {
	query := &CredentialQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := u.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(user.Table, user.FieldID, id),
			sqlgraph.To(credential.Table, credential.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, user.CredentialsTable, user.CredentialsColumn),
		)
		fromV = sqlgraph.Neighbors(u.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// QueryAuthncredentials queries the authncredentials edge of a User.
func (c *UserClient) QueryAuthncredentials(u *User) *WebauthnCredentialQuery {
	query := &WebauthnCredentialQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := u.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(user.Table, user.FieldID, id),
			sqlgraph.To(webauthncredential.Table, webauthncredential.FieldID),
			sqlgraph.Edge(sqlgraph.O2M, false, user.AuthncredentialsTable, user.AuthncredentialsColumn),
		)
		fromV = sqlgraph.Neighbors(u.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *UserClient) Hooks() []Hook {
	return c.hooks.User
}

// WebauthnCredentialClient is a client for the WebauthnCredential schema.
type WebauthnCredentialClient struct {
	config
}

// NewWebauthnCredentialClient returns a client for the WebauthnCredential from the given config.
func NewWebauthnCredentialClient(c config) *WebauthnCredentialClient {
	return &WebauthnCredentialClient{config: c}
}

// Use adds a list of mutation hooks to the hooks stack.
// A call to `Use(f, g, h)` equals to `webauthncredential.Hooks(f(g(h())))`.
func (c *WebauthnCredentialClient) Use(hooks ...Hook) {
	c.hooks.WebauthnCredential = append(c.hooks.WebauthnCredential, hooks...)
}

// Create returns a builder for creating a WebauthnCredential entity.
func (c *WebauthnCredentialClient) Create() *WebauthnCredentialCreate {
	mutation := newWebauthnCredentialMutation(c.config, OpCreate)
	return &WebauthnCredentialCreate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// CreateBulk returns a builder for creating a bulk of WebauthnCredential entities.
func (c *WebauthnCredentialClient) CreateBulk(builders ...*WebauthnCredentialCreate) *WebauthnCredentialCreateBulk {
	return &WebauthnCredentialCreateBulk{config: c.config, builders: builders}
}

// Update returns an update builder for WebauthnCredential.
func (c *WebauthnCredentialClient) Update() *WebauthnCredentialUpdate {
	mutation := newWebauthnCredentialMutation(c.config, OpUpdate)
	return &WebauthnCredentialUpdate{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOne returns an update builder for the given entity.
func (c *WebauthnCredentialClient) UpdateOne(wc *WebauthnCredential) *WebauthnCredentialUpdateOne {
	mutation := newWebauthnCredentialMutation(c.config, OpUpdateOne, withWebauthnCredential(wc))
	return &WebauthnCredentialUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// UpdateOneID returns an update builder for the given id.
func (c *WebauthnCredentialClient) UpdateOneID(id string) *WebauthnCredentialUpdateOne {
	mutation := newWebauthnCredentialMutation(c.config, OpUpdateOne, withWebauthnCredentialID(id))
	return &WebauthnCredentialUpdateOne{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// Delete returns a delete builder for WebauthnCredential.
func (c *WebauthnCredentialClient) Delete() *WebauthnCredentialDelete {
	mutation := newWebauthnCredentialMutation(c.config, OpDelete)
	return &WebauthnCredentialDelete{config: c.config, hooks: c.Hooks(), mutation: mutation}
}

// DeleteOne returns a builder for deleting the given entity.
func (c *WebauthnCredentialClient) DeleteOne(wc *WebauthnCredential) *WebauthnCredentialDeleteOne {
	return c.DeleteOneID(wc.ID)
}

// DeleteOne returns a builder for deleting the given entity by its id.
func (c *WebauthnCredentialClient) DeleteOneID(id string) *WebauthnCredentialDeleteOne {
	builder := c.Delete().Where(webauthncredential.ID(id))
	builder.mutation.id = &id
	builder.mutation.op = OpDeleteOne
	return &WebauthnCredentialDeleteOne{builder}
}

// Query returns a query builder for WebauthnCredential.
func (c *WebauthnCredentialClient) Query() *WebauthnCredentialQuery {
	return &WebauthnCredentialQuery{
		config: c.config,
	}
}

// Get returns a WebauthnCredential entity by its id.
func (c *WebauthnCredentialClient) Get(ctx context.Context, id string) (*WebauthnCredential, error) {
	return c.Query().Where(webauthncredential.ID(id)).Only(ctx)
}

// GetX is like Get, but panics if an error occurs.
func (c *WebauthnCredentialClient) GetX(ctx context.Context, id string) *WebauthnCredential {
	obj, err := c.Get(ctx, id)
	if err != nil {
		panic(err)
	}
	return obj
}

// QueryUser queries the user edge of a WebauthnCredential.
func (c *WebauthnCredentialClient) QueryUser(wc *WebauthnCredential) *UserQuery {
	query := &UserQuery{config: c.config}
	query.path = func(ctx context.Context) (fromV *sql.Selector, _ error) {
		id := wc.ID
		step := sqlgraph.NewStep(
			sqlgraph.From(webauthncredential.Table, webauthncredential.FieldID, id),
			sqlgraph.To(user.Table, user.FieldID),
			sqlgraph.Edge(sqlgraph.M2O, true, webauthncredential.UserTable, webauthncredential.UserColumn),
		)
		fromV = sqlgraph.Neighbors(wc.driver.Dialect(), step)
		return fromV, nil
	}
	return query
}

// Hooks returns the client hooks.
func (c *WebauthnCredentialClient) Hooks() []Hook {
	return c.hooks.WebauthnCredential
}
