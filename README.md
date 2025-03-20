# pixelplace

this website is a decentralized public pixel canvas hosted on the blockchain. it allows users to connect their wallets, select the pixel changes that they want made, and then submit their changes to the sepolia testnet blockchain, using firebase hosting to see the real time updates.

## features

- multiple users can update the shared canvas
- stored on the blockchain for decentralization
- can choose up to 16 colors thanks to optimization
- batch updating of up to 25 pixels in a single transaction because this probably wont have the traffic of the real r/place
- configurable cool down period set to 1 minute currently

## contract optimization

using claude, I was able to optimize the contract to reduce gas prices and increase efficiency, something grok was completley incapable of doing apparently.

- 4 bits per pixel for 16 colors
- batch updating
- configurable cooldown period

## how to use

1. go to pixelplaceeth.web.app
2. connect wallet through metamask or other service
3. select up to 25 pixels and colors, editing the public canvas
4. when ready, submit changes to the blockchain
