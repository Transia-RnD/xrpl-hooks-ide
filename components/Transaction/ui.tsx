import React, { FC, ReactNode, useCallback, useEffect, useState } from 'react'
// @ts-expect-error -- TODO
import { Container, Flex, Input, Select, CreatableSelect, Text } from '..'
import {
  SelectOption,
  TransactionState,
  transactionsOptions,
  TxFields,
  defaultPaymentTT,
  defaultCallTT
} from '../../state/transactions'
import { useSnapshot } from 'valtio'
import state from '../../state'
import { streamState } from '../DebugStream'
import { Box, Button } from '..'
import Textarea from '../Textarea'
import { getFlags } from '../../state/constants/flags'
import { Plus, Trash } from 'phosphor-react'
import AccountSequence from '../Sequence'
import { capitalize, typeIs } from '../../utils/helpers'
import { rpc } from '../../state/actions/xrpl-client'
import ContractSource from '@transia/xrpl/dist/npm/models/ledger/ContractSource'
import { isHex } from '../../utils/hex'
import { convertHexToString, Function } from '@transia/xrpl'
import sha512Half from '@transia/xrpl/dist/npm/utils/hashes/sha512Half'

const ledgerSpaces = {
  contractSource: 'Z',
  contract: 'z',
  contractData: 'b',
}

function ledgerSpaceHex(name: keyof typeof ledgerSpaces): string {
  return ledgerSpaces[name].charCodeAt(0).toString(16).padStart(4, '0')
}

export function hashContractSource(contractHash: string): string {
  return sha512Half(
    ledgerSpaceHex('contractSource') +
      contractHash,
  )
}

interface UIProps {
  setState: (pTx?: Partial<TransactionState> | undefined) => TransactionState | undefined
  resetState: (tt?: SelectOption) => TransactionState | undefined
  state: TransactionState
  estimateFee?: (...arg: any) => Promise<string | undefined>
  estimateCallFee?: (...arg: any) => Promise<string | undefined>
  switchToJson: () => void
}

// Fetch contract source from account or hash
const fetchContractSourceFromAccount = async (address: string, accounts: any[]): Promise<ContractSource> => {
  // get account from account state
  const account = accounts.find(acc => acc.address === address)
  const contractResponse = await rpc({
    command: 'ledger_entry',
    index: account.contract,
  })
  // @ts-expect-error -- TODO
  const wasmHash = contractResponse?.result?.node?.ContractHash;
  if (!wasmHash) {
    throw new Error('No contract found for this account')
  }
  const sourceResponse = await rpc({
    command: 'ledger_entry',
    index: hashContractSource(wasmHash),
  }) as any
  console.log(sourceResponse.result?.node);
  
  return sourceResponse.result?.node as ContractSource;
}

const fetchContractSourceFromHash = async (hash: string): Promise<ContractSource> => {
  const sourceResponse = await rpc({
    command: 'ledger_entry',
    index: hash
  }) as any
  return sourceResponse.result?.node as ContractSource;
}

// Helper to convert between hex and text
const convertToHex = (text: string): string => {
  return Buffer.from(text, 'utf8').toString('hex').toUpperCase()
}

const convertFromHex = (hex: string): string => {
  if (!isHex(hex)) return hex
  return convertHexToString(hex)
}

export const TxUI: FC<UIProps> = ({
  state: txState,
  setState,
  resetState,
  estimateFee,
  estimateCallFee,
  switchToJson
}) => {
  const { accounts } = useSnapshot(state)
  const { selectedAccount, selectedTransaction, txFields, selectedFlags, memos } = txState

  // Smart Contract Testing State
  const [testMode, setTestMode] = useState<'contract' | 'transaction'>('contract')
  const [loadMode, setLoadMode] = useState<'account' | 'hash'>('account')
  const [selectedContractAccount, setSelectedContractAccount] = useState<SelectOption | null>(null)
  const [contractHash, setContractHash] = useState('')
  const [contractSource, setContractSource] = useState<ContractSource | null>(null)
  const [selectedFunction, setSelectedFunction] = useState<Function | null>(null)
  const [functionParameters, setFunctionParameters] = useState<Record<string, string>>({})
  const [isHexMode, setIsHexMode] = useState(false)
  const [loadingContract, setLoadingContract] = useState(false)

  const accountOptions: SelectOption[] = accounts.map(acc => ({
    label: acc.name,
    value: acc.address
  }))

  // Filter accounts that have contracts (checking for ContractHash field)
  const contractAccountOptions: SelectOption[] = accounts
    .filter(acc => (acc as any).contract) // Filter accounts with ContractHash
    .map(acc => ({
      label: acc.name,
      value: acc.address
    }))

  const flagsOptions: SelectOption[] = Object.entries(
    getFlags(selectedTransaction?.value) || {}
  ).map(([label, value]) => ({
    label,
    value
  }))

  const [feeLoading, setFeeLoading] = useState(false)

  const handleSetAccount = (acc: SelectOption) => {
    setState({ selectedAccount: acc })
    streamState.selectedAccount = acc
  }

  const handleSetField = useCallback(
    (field: keyof TxFields, value: string, opFields?: TxFields) => {
      const fields = opFields || txFields
      const obj = fields[field]
      setState({
        txFields: {
          ...fields,
          [field]: typeof obj === 'object' ? { ...obj, $value: value } : value
        }
      })
    },
    [setState, txFields]
  )

  const setRawField = useCallback(
    (field: keyof TxFields, type: string, value: any) => {
      setState({
        txFields: {
          ...txFields,
          [field]: {
            $type: type,
            $value: value
          }
        }
      })
    },
    [setState, txFields]
  )

  const handleEstimateFee = useCallback(
    async (state?: TransactionState, silent?: boolean) => {
      setFeeLoading(true)
      const fee = await estimateFee?.(state, { silent })
      if (fee) handleSetField('Fee', fee, state?.txFields)
      setFeeLoading(false)
    },
    [estimateFee, handleSetField]
  )

  const handleEstimateAllowance = useCallback(
    async (state?: TransactionState, silent?: boolean) => {
      setFeeLoading(true)
      const fee = await estimateCallFee?.(state, { silent })
      if (fee) {
        handleSetField('ComputationAllowance', fee, state?.txFields)
      }
      setFeeLoading(false)
    },
    [estimateCallFee, handleSetField]
  )

  const handleChangeTxType = useCallback(
    (tt: SelectOption) => {
      setState({ selectedTransaction: tt })
      const newState = resetState(tt)
      handleEstimateFee(newState, true)
      handleEstimateAllowance(newState, true)
    },
    [handleEstimateFee, handleEstimateAllowance, resetState, setState]
  )

  // Load contract from selected account
  const handleLoadContractFromAccount = async (account: SelectOption) => {
    setLoadingContract(true)
    try {
      const source = await fetchContractSourceFromAccount(account.value, accounts)
      setContractSource(source)
      setSelectedContractAccount(account)
      setSelectedFunction(null)
      setFunctionParameters({})
      
      // Update transaction state with ContractAccount
      setRawField('ContractAccount', 'account', account.value)
    } catch (error) {
      console.error('Failed to load contract source:', error)
    } finally {
      setLoadingContract(false)
    }
  }

  // Load contract from hash
  const handleLoadContractFromHash = async () => {
    if (!contractHash.trim()) return
    
    setLoadingContract(true)
    try {
      const source = await fetchContractSourceFromHash(contractHash)
      setContractSource(source)
      setSelectedFunction(null)
      setFunctionParameters({})
      
      // When loading from hash, we don't set ContractAccount
      // User needs to select which account will call the contract
    } catch (error) {
      console.error('Failed to load contract source:', error)
    } finally {
      setLoadingContract(false)
    }
  }

  // Handle function selection
  const handleFunctionChange = (func: Function | null) => {
    setSelectedFunction(func)
    
    if (!func) {
      throw new Error('No function selected')
    }

    // Update transaction state with FunctionName
    const functionName = func.Function.FunctionName
    
    // Initialize empty parameters object for user input
    const emptyParams: Record<string, string> = {}
    func?.Function.Parameters?.forEach((_, idx) => {
      emptyParams[idx] = ''
    })
    setFunctionParameters(emptyParams)
    
    // Clear Parameters in transaction state initially
    setState({
      txFields: {
        ...txFields,
        // @ts-expect-error -- TODO
        FunctionName: {
          $type: 'hexable',
          $ishex: isHex(functionName),
          $value: functionName
        },
        Parameters: undefined
      }
    })
  }

  // Handle parameter value change
  const handleParameterChange = (paramIndex: number, value: string, param: any) => {
    // @ts-ignore -- TODO
    const paramType = param.Parameter.ParameterType?.type || 'string'
    
    // Update local state
    const updatedParams = {
      ...functionParameters,
      [paramIndex]: value
    }
    setFunctionParameters(updatedParams)
    
    // Build Parameters array for transaction - only include non-empty values
    const parametersArray: any[] = []
    
    // Get all parameters from the selected function
    selectedFunction?.Function.Parameters?.forEach((p, idx) => {
      // @ts-expect-error -- TODO
      const val = updatedParams[idx]
      if (val && val !== '') {
        const pType = p.Parameter.ParameterType?.type || 'string'
        const pFlag = p.Parameter.ParameterFlag
        
        // Parse value based on type
        let parsedValue: any = val
        
        // For numeric types, convert to number
        if (pType === 'UINT8' || pType === 'UINT16' || pType === 'UINT32' || pType === 'UINT64' || 
            pType === 'INT8' || pType === 'INT16' || pType === 'INT32' || pType === 'INT64') {
          parsedValue = parseInt(val, 10)
        }
        
        // Build the parameter object
        const paramObj: any = {
          Parameter: {
            ParameterValue: {
              type: pType,
              value: parsedValue
            }
          }
        }
        
        // Add ParameterFlag if it exists
        if (pFlag !== undefined) {
          paramObj.Parameter.ParameterFlag = pFlag
        }
        
        parametersArray[idx] = paramObj
      }
    })
    
    // Update transaction state
    setState({
      txFields: {
        ...txFields,
        Parameters: parametersArray.length > 0 ? parametersArray : undefined
      }
    })
  }

  // Toggle hex mode for function name
  const handleToggleHexMode = () => {
    const newHexMode = !isHexMode
    setIsHexMode(newHexMode)
    
    if (selectedFunction) {
      const functionName = selectedFunction.Function.FunctionName
      const currentValue = (txFields.FunctionName as any)?.$value || functionName
      
      let newValue: string
      if (newHexMode) {
        // Convert to hex
        newValue = isHex(currentValue) ? currentValue : convertToHex(currentValue)
      } else {
        // Convert to text
        newValue = isHex(currentValue) ? convertFromHex(currentValue) : currentValue
      }
      
      setState({
        txFields: {
          ...txFields,
          // @ts-expect-error -- TODO
          FunctionName: {
            $type: 'hexable',
            $ishex: newHexMode,
            $value: newValue
          }
        }
      })
    }
  }

  // Get display value for function name based on hex mode
  const getFunctionNameDisplay = (name: string) => {
    // If the name from ledger is hex, convert to text for display
    const textName = isHex(name) ? convertFromHex(name) : name
    
    if (isHexMode) {
      return convertToHex(textName)
    }
    return textName
  }

  // Function options for dropdown - always show as text
  const functionOptions: SelectOption[] =
    contractSource?.Functions.map(func => {
      const functionName = func.Function.FunctionName
      const displayName = isHex(functionName) ? convertFromHex(functionName) : functionName
      return {
        label: displayName,
        value: functionName // Keep original value for lookup
      }
    }) || []

  // Default tx
  useEffect(() => {
    if (selectedTransaction?.value) return
    
    if (testMode === 'contract' && defaultCallTT) {
      handleChangeTxType(defaultCallTT)
    }

    if (testMode === 'transaction' && defaultPaymentTT) {
      handleChangeTxType(defaultPaymentTT)
    }
  }, [handleChangeTxType, selectedTransaction?.value, testMode])

  const richFields = ['TransactionType', 'Account', 'HookParameters', 'Memos']

  if (flagsOptions.length) {
    richFields.push('Flags')
  }

  const otherFields = Object.keys(txFields).filter(k => !richFields.includes(k)) as [
    keyof TxFields
  ]
  
  const amountOptions = [
    { label: 'XRP', value: 'xrp' },
    { label: 'Token', value: 'token' }
  ] as const

  const defaultTokenAmount = {
    value: '0',
    currency: '',
    issuer: ''
  }

  // Smart Contract Testing UI
  if (testMode === 'contract') {
    return (
      <Container
        css={{
          p: '$3 0',
          fontSize: '$sm',
          height: 'calc(100% - 45px)'
        }}
      >
        <Flex column fluid css={{ height: '100%', overflowY: 'auto', pr: '$1' }}>
          {/* Mode Toggle */}
          <TxField label="Test Mode">
            <Flex row css={{ gap: '$2' }}>
              <Button
                size="sm"
                variant={testMode === 'contract' ? 'primary' : undefined}
                outline={testMode !== 'contract'}
                onClick={() => setTestMode('contract')}
              >
                Smart Contract
              </Button>
              <Button
                size="sm"
                // @ts-expect-error -- TODO
                variant={testMode === 'transaction' ? 'primary' : undefined}
                // @ts-expect-error -- TODO
                outline={testMode !== 'transaction'}
                onClick={() => setTestMode('transaction')}
              >
                Transaction
              </Button>
            </Flex>
          </TxField>

          {/* Account Selection */}
          <TxField label="Account">
            <Select
              instanceId="from-account"
              placeholder="Select your account"
              options={accountOptions}
              value={selectedAccount}
              onChange={(acc: any) => handleSetAccount(acc)}
            />
          </TxField>

          {/* Contract Source */}
          <TxField label="Load Mode">
            <Flex row css={{ gap: '$2' }}>
              <Button
                size="xs"
                variant={loadMode === 'account' ? 'primary' : undefined}
                outline={loadMode !== 'account'}
                onClick={() => setLoadMode('account')}
              >
                Account
              </Button>
              <Button
                size="xs"
                variant={loadMode === 'hash' ? 'primary' : undefined}
                outline={loadMode !== 'hash'}
                onClick={() => setLoadMode('hash')}
              >
                Hash
              </Button>
            </Flex>
          </TxField>

          {loadMode === 'account' ? (
            <TxField label="Contract Account">
              <Select
                instanceId="contract-account"
                placeholder="Select contract account"
                options={contractAccountOptions}
                value={selectedContractAccount}
                onChange={(acc: any) => {
                  if (acc) {
                    handleLoadContractFromAccount(acc)
                  }
                }}
                isLoading={loadingContract}
              />
            </TxField>
          ) : (
            <TxField label="Contract Hash">
              <Flex row css={{ width: '100%', gap: '$2' }}>
                <Input
                  placeholder="Enter contract hash"
                  value={contractHash}
                  onChange={e => setContractHash(e.target.value)}
                  css={{ flex: 1 }}
                />
                <Button
                  size="sm"
                  variant="primary"
                  outline
                  isLoading={loadingContract}
                  onClick={handleLoadContractFromHash}
                >
                  Load
                </Button>
              </Flex>
            </TxField>
          )}

          {/* Function Selection */}
          {contractSource && (
            <TxField label="Function">
              <Flex row css={{ width: '100%', alignItems: 'center', gap: '$2' }}>
                <Select
                  instanceId="function-select"
                  placeholder="Select function"
                  options={functionOptions}
                  value={
                    selectedFunction
                      ? {
                          label: getFunctionNameDisplay(selectedFunction.Function.FunctionName),
                          value: selectedFunction.Function.FunctionName
                        }
                      : undefined
                  }
                  onChange={(opt: any) => {
                    const func = contractSource.Functions.find(
                      f => f.Function.FunctionName === opt?.value
                    )
                    handleFunctionChange(func || null)
                  }}
                  css={{ flex: 1 }}
                />
                <Button
                  size="xs"
                  outline
                  onClick={handleToggleHexMode}
                  css={{ minWidth: '60px' }}
                >
                  {isHexMode ? 'HEX' : 'TEXT'}
                </Button>
              </Flex>
            </TxField>
          )}

          {/* Parameters */}
          {selectedFunction && selectedFunction.Function.Parameters && (
            <>
              <Box css={{ mt: '$3', mb: '$2' }}>
                <Text muted css={{ fontSize: '$xs', textTransform: 'uppercase', fontWeight: 600 }}>
                  Function Parameters
                </Text>
              </Box>

              {selectedFunction.Function.Parameters.map((param, idx) => {
                const paramType = param.Parameter.ParameterType?.type || 'unknown'
                const paramFlag = param.Parameter.ParameterFlag

                return (
                  <TxField key={idx} label={`Parameter ${idx}`}>
                    <Flex column css={{ width: '100%' }}>
                      <Input
                        placeholder={`Enter value (${paramType})`}
                        value={functionParameters[idx] || ''}
                        onChange={e => handleParameterChange(idx, e.target.value, param)}
                        css={{ flex: 'inherit' }}
                      />
                      <Text
                        muted
                        css={{
                          fontSize: '$xs',
                          mt: '$1',
                          fontFamily: '$monospace'
                        }}
                      >
                        Type: {paramType}
                        {paramFlag !== undefined && ` | Flag: ${paramFlag}`}
                      </Text>
                    </Flex>
                  </TxField>
                )
              })}
            </>
          )}

          {/* Computation Allowance */}
          <TxField label="Computation Allowance">
            <Flex css={{ width: '100%', position: 'relative', alignItems: 'center' }}>
              <Input
                type="number"
                placeholder="Enter computation allowance"
                value={(txFields.ComputationAllowance as any) || ''}
                onChange={e => handleSetField('ComputationAllowance', e.target.value)}
                css={{
                  flex: 'inherit',
                  '-moz-appearance': 'textfield',
                  '&::-webkit-outer-spin-button': {
                    '-webkit-appearance': 'none',
                    margin: 0
                  },
                  '&::-webkit-inner-spin-button ': {
                    '-webkit-appearance': 'none',
                    margin: 0
                  }
                }}
              />
              <Button
                size="xs"
                variant="primary"
                outline
                isLoading={feeLoading}
                css={{
                  position: 'absolute',
                  right: '$2',
                  fontSize: '$xs',
                  cursor: 'pointer',
                  alignContent: 'center',
                  display: 'flex'
                }}
                onClick={() => handleEstimateAllowance()}
              >
                Suggest
              </Button>
            </Flex>
          </TxField>
        </Flex>
      </Container>
    )
  }

  // Original Transaction UI
  return (
    <Container
      css={{
        p: '$3 0',
        fontSize: '$sm',
        height: 'calc(100% - 45px)'
      }}
    >
      <Flex column fluid css={{ height: '100%', overflowY: 'auto', pr: '$1' }}>
        {/* Mode Toggle */}
        <TxField label="Test Mode">
          <Flex row css={{ gap: '$2' }}>
            <Button
              size="sm"
              // @ts-expect-error -- TODO
              variant={testMode === 'contract' ? 'primary' : undefined}
              // @ts-expect-error -- TODO
              outline={testMode !== 'contract'}
              onClick={() => setTestMode('contract')}
            >
              Smart Contract
            </Button>
            <Button
              size="sm"
              variant={testMode === 'transaction' ? 'primary' : undefined}
              outline={testMode !== 'transaction'}
              onClick={() => setTestMode('transaction')}
            >
              Transaction
            </Button>
          </Flex>
        </TxField>

        <TxField label="Transaction Type">
          <Select
            instanceId="tx-type"
            placeholder="Select transaction type"
            options={transactionsOptions}
            value={selectedTransaction}
            onChange={(e: any) => handleChangeTxType(e)}
          />
        </TxField>
        <TxField label="Account">
          <Flex
            row
            css={{
              flex: '1',
              alignItems: 'flex-end'
            }}
          >
            <Select
              instanceId="from-account"
              placeholder="Select your account"
              options={accountOptions}
              value={selectedAccount}
              onChange={(acc: any) => handleSetAccount(acc)}
            />
            <AccountSequence />
          </Flex>
        </TxField>
        {flagsOptions.length > 0 && (
          <TxField label="Flags">
            <Select
              instanceId="flags"
              placeholder="Select flags"
              isMulti
              options={flagsOptions}
              value={selectedFlags}
              onChange={(flags: any) => {
                setState({ selectedFlags: flags })
              }}
            />
          </TxField>
        )}
        {otherFields.map(field => {
          const fieldVal = txFields[field]
          const isFee = field === 'Fee'
          const isComputationAllowance = field === 'ComputationAllowance'
          const isJson = typeIs(fieldVal, 'object') || typeIs(fieldVal, 'array')
          // @ts-expect-error -- TODO
          const isAmount = typeIs(fieldVal, 'amount')
          // @ts-expect-error -- TODO
          const isAccount = typeIs(fieldVal, 'account')
          const value = typeIs(fieldVal, 'object')
            // @ts-expect-error -- TODO
            ? fieldVal.$value
            : typeIs(fieldVal, 'array')
            ? JSON.stringify(fieldVal, undefined, 2)
            : fieldVal

          const rows = value ? (value.toString().match(/\n/g)?.length || 3) : 3

          if (isAmount) {
            // @ts-expect-error -- TODO
            const isXrpAmount = typeIs(fieldVal, 'amount.xrp')
            const tokenAmount = isXrpAmount ? defaultTokenAmount : (value as any)

            return (
              <TxField key={field} label={field}>
                <Flex row css={{ width: '100%', gap: 0 }}>
                  {!isXrpAmount ? (
                    <Flex column css={{ gap: '$2', flex: 1, mr: '$2' }}>
                      <Input
                        placeholder="Value"
                        value={tokenAmount.value}
                        onChange={e => {
                          setRawField(field, 'amount.token', { ...tokenAmount, value: e.target.value })
                        }}
                      />
                      <Input
                        placeholder="Currency"
                        value={tokenAmount.currency}
                        onChange={e => {
                          setRawField(field, 'amount.token', {
                            ...tokenAmount,
                            currency: e.target.value
                          })
                        }}
                      />
                      <CreatableAccount
                        value={tokenAmount.issuer}
                        field={'Issuer' as any}
                        placeholder="Issuer"
                        setField={(_, issuer) => {
                          setRawField(field, 'amount.token', { ...tokenAmount, issuer })
                        }}
                      />
                    </Flex>
                  ) : (
                    <Input
                      placeholder="Amount in drops"
                      value={value}
                      onChange={e => {
                        handleSetField(field, e.target.value)
                      }}
                      css={{
                        flex: 'inherit',
                        mr: '$2'
                      }}
                    />
                  )}
                  <Box css={{ ml: 'auto', minWidth: '70px' }}>
                    <Select
                      instanceId={field}
                      isSearchable={false}
                      options={amountOptions}
                      value={amountOptions.find(o =>
                        isXrpAmount ? o.value === 'xrp' : o.value === 'token'
                      )}
                      onChange={(e: any) => {
                        const opt = e as (typeof amountOptions)[number]
                        if (opt.value === 'xrp') {
                          setRawField(field, 'amount.xrp', '0')
                        } else {
                          setRawField(field, 'amount.token', defaultTokenAmount)
                        }
                      }}
                    />
                  </Box>
                </Flex>
              </TxField>
            )
          }
          if (isAccount) {
            return (
              <TxField key={field} label={field}>
                <CreatableAccount value={value} field={field} setField={handleSetField} />
              </TxField>
            )
          }

          return (
            <TxField key={field} label={field}>
              {isJson ? (
                <Textarea
                  rows={rows}
                  value={value}
                  spellCheck={false}
                  onChange={switchToJson}
                  css={{
                    flex: 'inherit',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <Input
                  type={isFee ? 'number' : 'text'}
                  value={value}
                  onChange={e => {
                    if (isFee) {
                      const val = e.target.value.replaceAll('.', '').replaceAll(',', '')
                      handleSetField(field, val)
                    } else {
                      handleSetField(field, e.target.value)
                    }
                  }}
                  onKeyPress={
                    isFee
                      ? e => {
                          if (e.key === '.' || e.key === ',') {
                            e.preventDefault()
                          }
                        }
                      : undefined
                  }
                  css={{
                    flex: 'inherit',
                    '-moz-appearance': 'textfield',
                    '&::-webkit-outer-spin-button': {
                      '-webkit-appearance': 'none',
                      margin: 0
                    },
                    '&::-webkit-inner-spin-button ': {
                      '-webkit-appearance': 'none',
                      margin: 0
                    }
                  }}
                />
              )}
              {isComputationAllowance && (
                <Button
                  size="xs"
                  variant="primary"
                  outline
                  disabled={txState.txIsDisabled}
                  isDisabled={txState.txIsDisabled}
                  isLoading={feeLoading}
                  css={{
                    position: 'absolute',
                    right: '$2',
                    fontSize: '$xs',
                    cursor: 'pointer',
                    alignContent: 'center',
                    display: 'flex'
                  }}
                  onClick={() => handleEstimateAllowance()}
                >
                  Suggest
                </Button>
              )}
            </TxField>
          )
        })}
        <TxField multiLine label="Memos">
          <Flex column fluid>
            {Object.entries(memos).map(([id, memo]) => (
              <Flex column key={id} css={{ mb: '$2' }}>
                <Flex
                  row
                  css={{
                    flexWrap: 'wrap',
                    width: '100%'
                  }}
                >
                  <Input
                    placeholder="Memo type"
                    value={memo.type}
                    onChange={e => {
                      setState({
                        memos: {
                          ...memos,
                          [id]: { ...memo, type: e.target.value }
                        }
                      })
                    }}
                  />
                  <Input
                    placeholder="Data (hex-quoted)"
                    css={{ mx: '$2' }}
                    value={memo.data}
                    onChange={e => {
                      setState({
                        memos: {
                          ...memos,
                          [id]: { ...memo, data: e.target.value }
                        }
                      })
                    }}
                  />
                  <Input
                    placeholder="Format"
                    value={memo.format}
                    onChange={e => {
                      setState({
                        memos: {
                          ...memos,
                          [id]: { ...memo, format: e.target.value }
                        }
                      })
                    }}
                  />
                  <Button
                    css={{ ml: '$2' }}
                    onClick={() => {
                      const { [id]: _, ...rest } = memos
                      setState({ memos: rest })
                    }}
                    variant="destroy"
                  >
                    <Trash weight="regular" size="16px" />
                  </Button>
                </Flex>
              </Flex>
            ))}
            <Button
              outline
              fullWidth
              type="button"
              onClick={() => {
                const id = Object.keys(memos).length
                setState({
                  memos: { ...memos, [id]: { data: '', format: '', type: '' } }
                })
              }}
            >
              <Plus size="16px" />
              Add Memo
            </Button>
          </Flex>
        </TxField>
      </Flex>
    </Container>
  )
}

export const CreatableAccount: FC<{
  value: string | undefined
  field: keyof TxFields
  placeholder?: string
  setField: (field: keyof TxFields, value: string, opFields?: TxFields) => void
}> = ({ value, field, setField, placeholder }) => {
  const { accounts } = useSnapshot(state)
  const accountOptions: SelectOption[] = accounts.map(acc => ({
    label: acc.name,
    value: acc.address
  }))
  const label = accountOptions.find(a => a.value === value)?.label || value
  const val = {
    value,
    label
  }
  placeholder = placeholder || `${capitalize(field)} account`
  return (
    <CreatableSelect
      isClearable
      instanceId={field}
      placeholder={placeholder}
      options={accountOptions}
      value={value ? val : undefined}
      onChange={(acc: any) => setField(field, acc?.value)}
    />
  )
}

export const TxField: FC<{ label: string; children: ReactNode; multiLine?: boolean }> = ({
  label,
  children,
  multiLine = false
}) => {
  return (
    <Flex
      row
      fluid
      css={{
        justifyContent: 'flex-end',
        alignItems: multiLine ? 'flex-start' : 'center',
        position: 'relative',
        mb: '$2',
        mt: '1px',
        pr: '1px'
      }}
    >
      <Text muted css={{ mr: '$3', mt: multiLine ? '$2' : 0 }}>
        {label}:{' '}
      </Text>
      <Flex css={{ width: '70%', alignItems: 'center' }}>{children}</Flex>
    </Flex>
  )
}