const {exceptions: {UnexpectedError}} = require('@welldone-software/node-toolbelt')
const context = require('../context')
const {omit} = require('lodash')
const {errors: {logError}} = require('stox-common')
const {getAccountAddresses} = require('./blockchain/smartWallets')

const {db, config, mq} = context

const insertTransactions = async (tokenId, transactions, currentBlockTime) => {
  const transaction = await db.sequelize.transaction()

  try {
    await Promise.all(transactions.map((t) => {
      const {amount, blockNumber, logIndex, from, to, transactionHash, event} = t
      return db.tokensTransfers.create(
        {
          blockNumber: Number(blockNumber),
          logIndex,
          transactionHash,
          tokenId,
          network: config.network,
          currentBlockTime,
          fromAddress: from,
          toAddress: to,
          amount: Number(amount),
          rawData: event,
        },
        {transaction}
      )
    }))
    await transaction.commit()
  } catch (e) {
    transaction.rollback()
    throw new UnexpectedError(e)
  }
}

const sendTransactionsToBackend = async (asset, walletAddress, transactions, balance, happenedAt) => {
  try {
  const {feesAccount, userWithdrawalAccount} = await getAccountAddresses(walletAddress)
  const message = {
    network: config.network,
    walletAddress,
    feesAccount,
    userWithdrawalAccount,
    asset,
    balance,
    happenedAt,
    transactions: transactions.map(({from, transactionHash, to, amount}) => ({
      from,
      to,
      transactionHash,
      amount,
      status: 'confirmed',
    })),
  }
    mq.publish('uncompleted-blockchain-token-transfers', message)
    const rest = omit(message, 'transactions')
    context.logger.info(
      {
        ...rest,
        transactions: transactions.length,
        hash: transactions.map(t => t.transactionHash),
      },
      'SEND_TRANSACTIONS'
    )
  } catch (e) {
    logError(e)
  }
}



module.exports = {insertTransactions, sendTransactionsToBackend}
